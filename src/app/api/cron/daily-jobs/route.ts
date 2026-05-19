import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

import { verifyCronSecretFromHeaders } from "@/lib/security/cron-auth";
import { ensureAppSettingsIndexes, getAppSettings } from "@/lib/lonaci/app-settings";
import { broadcastCriticalEmailToRole } from "@/lib/lonaci/critical-email";
import { buildReportSummary, summaryToCsv } from "@/lib/lonaci/reports";
import { ensureNotificationIndexes, notifyRoleTargets } from "@/lib/lonaci/notifications";
import { listActiveUsersByRole } from "@/lib/lonaci/users";
import { sendSmtpEmail } from "@/lib/email/smtp";
import {
  dispatchAutomaticSuccessionStaleAlerts,
  ensureSuccessionIndexes,
  listSuccessionStaleAlerts,
} from "@/lib/lonaci/succession";
import { dispatchAutomaticCautionJ10Alerts } from "@/lib/lonaci/caution-j10-alerts";
import { ensureSprint4Indexes, listCautionAlertsJ10 } from "@/lib/lonaci/sprint4";
import { getDatabase } from "@/lib/mongodb";

const RUNS = "report_cron_runs";
const LOCKS = "job_locks";
const DEFAULT_ARTIFACT_RETENTION_DAYS = 30;
const DEFAULT_SUPERVISION_LOCK_TTL_SECONDS = 15 * 60;

interface JobLockDocument {
  _id: string;
  locked: boolean;
  owner: string | null;
  expiresAt: Date;
  updatedAt: Date;
  lockedAt?: Date;
  releasedAt?: Date;
}

interface AppSettingsGlobalDocument {
  _id: string;
  supervisionExportLastRunAt?: Date;
  supervisionExportLastStatus?: "OK" | "ERROR";
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function acquireSupervisionLock(db: Awaited<ReturnType<typeof getDatabase>>, owner: string) {
  const locksCollection = db.collection<JobLockDocument>(LOCKS);
  const now = new Date();
  const lockTtlSeconds = parsePositiveInt(
    process.env.SUPERVISION_LOCK_TTL_SECONDS,
    DEFAULT_SUPERVISION_LOCK_TTL_SECONDS,
  );
  const expiresAt = new Date(now.getTime() + lockTtlSeconds * 1000);
  await locksCollection.updateOne(
    { _id: "supervision_export_daily" },
    {
      $setOnInsert: {
        locked: false,
        owner: null,
        expiresAt: new Date(0),
        updatedAt: new Date(0),
      },
    },
    { upsert: true },
  );
  const result = await locksCollection.updateOne(
    {
      _id: "supervision_export_daily",
      $or: [{ locked: false }, { expiresAt: { $lte: now } }],
    },
    {
      $set: {
        locked: true,
        owner,
        lockedAt: now,
        expiresAt,
        updatedAt: now,
      },
    },
  );
  return { acquired: result.modifiedCount > 0, expiresAt };
}

async function releaseSupervisionLock(db: Awaited<ReturnType<typeof getDatabase>>, owner: string) {
  const locksCollection = db.collection<JobLockDocument>(LOCKS);
  await locksCollection.updateOne(
    { _id: "supervision_export_daily", owner },
    {
      $set: {
        locked: false,
        owner: null,
        expiresAt: new Date(0),
        releasedAt: new Date(),
        updatedAt: new Date(),
      },
    },
  );
}

function authorizeCron(request: NextRequest): boolean {
  return verifyCronSecretFromHeaders(
    request.headers.get("authorization"),
    request.headers.get("x-cron-secret"),
    process.env.CRON_SECRET,
  );
}

async function buildSupervisionAttachment(
  format: "pdf" | "csv" | "xlsx",
  payload: {
    generatedAt: Date;
    cautionsJ10: number;
    successionStale: number;
    dailyCsv: string;
  },
): Promise<{ filename: string; contentType: string; content: Buffer }> {
  const stamp = payload.generatedAt.toISOString().slice(0, 10);
  if (format === "csv") {
    return {
      filename: `supervision-export-${stamp}.csv`,
      contentType: "text/csv; charset=utf-8",
      content: Buffer.from(payload.dailyCsv, "utf8"),
    };
  }
  if (format === "xlsx") {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const metaRows = [
      { key: "generatedAt", value: payload.generatedAt.toISOString() },
      { key: "cautionsJ10", value: payload.cautionsJ10 },
      { key: "successionStale", value: payload.successionStale },
    ];
    const rows = payload.dailyCsv.split(/\r?\n/).slice(0, 300).map((line) => ({ line }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(metaRows), "meta");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "daily_csv_preview");
    const array = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    return {
      filename: `supervision-export-${stamp}.xlsx`,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      content: Buffer.from(array),
    };
  }

  const PDFDocument = (await import("pdfkit")).default;
  const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 24, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.fontSize(14).text("Export supervision automatique", { underline: true });
    doc.moveDown(0.4);
    doc.fontSize(10).text(`Date: ${payload.generatedAt.toLocaleString("fr-FR")}`);
    doc.fontSize(10).text(`Cautions J+10: ${payload.cautionsJ10}`);
    doc.fontSize(10).text(`Successions sans action: ${payload.successionStale}`);
    doc.moveDown(0.6);
    doc.fontSize(9).text("Apercu CSV:");
    for (const line of payload.dailyCsv.split(/\r?\n/).slice(0, 60)) {
      doc.fontSize(8).text(line);
    }
    doc.end();
  });
  return {
    filename: `supervision-export-${stamp}.pdf`,
    contentType: "application/pdf",
    content: pdfBuffer,
  };
}

export async function POST(request: NextRequest) {
  if (!authorizeCron(request)) {
    if (!process.env.CRON_SECRET?.trim()) {
      return NextResponse.json({ message: "CRON_SECRET non configure" }, { status: 503 });
    }
    return NextResponse.json({ message: "Non autorise" }, { status: 401 });
  }

  await ensureSprint4Indexes();
  await ensureSuccessionIndexes();

  const supervisionOnly = request.headers.get("x-supervision-only") === "1";

  const daily = await buildReportSummary("daily");
  const staleSuccession = await listSuccessionStaleAlerts();
  const successionStaleDispatch = await dispatchAutomaticSuccessionStaleAlerts();
  const j10Dispatch = await dispatchAutomaticCautionJ10Alerts();
  const cautionsJ10 = await listCautionAlertsJ10();

  const db = await getDatabase();
  const appSettingsCollection = db.collection<AppSettingsGlobalDocument>("app_settings");
  if (!supervisionOnly) {
    await db.collection(RUNS).insertOne({
      kind: "daily_jobs",
      createdAt: new Date(),
      summary: {
        dossiersTotal: daily.dossiers.total,
        cautionsJ10: cautionsJ10.length,
        cautionsJ10Alerted: j10Dispatch.alerted,
        successionStale: staleSuccession.length,
        successionStaleAlerted: successionStaleDispatch.alerted,
      },
      csvSnippet: summaryToCsv(daily).split("\n").slice(0, 12).join("\n"),
    });
  }

  await ensureAppSettingsIndexes();
  await ensureNotificationIndexes();
  const settings = await getAppSettings();
  if (supervisionOnly && !settings.supervisionExportCronEnabled) {
    return NextResponse.json(
      {
        ok: false,
        skipped: true,
        reason: "Export supervision automatique desactive dans les parametres.",
      },
      { status: 412 },
    );
  }
  if (!supervisionOnly && settings.criticalWorkflowEmailEnabled && process.env.SMTP_HOST) {
    const body = [
      `Rapport journalier (${daily.windowLabel})`,
      `Dossiers: ${daily.dossiers.total}, créés période: ${daily.dossiers.createdInWindow}`,
      `Contrats actifs: ${daily.contrats.actifs}`,
      `Cautions en attente: ${daily.cautions.enAttente}, alertes J+10: ${daily.cautions.alertesJ10}`,
      `Succession ouverts: ${daily.succession.ouverts}, sans action 30j: ${daily.succession.stale30j}`,
      `PDV non finalisés: ${daily.pdvIntegrations.nonFinalise}`,
    ].join("\n");

    await broadcastCriticalEmailToRole("CHEF_SERVICE", "Rapport journalier automatique", body);
  }

  if (settings.supervisionExportCronEnabled) {
    const lockOwner = randomUUID();
    const lock = await acquireSupervisionLock(db, lockOwner);
    if (!lock.acquired) {
      await db.collection(RUNS).insertOne({
        kind: "supervision_export_daily",
        createdAt: new Date(),
        status: "LOCKED",
        summary: {
          message: "Un run supervision est deja en cours.",
        },
      });
      return NextResponse.json(
        {
          ok: false,
          locked: true,
          message: "Un run supervision est déjà en cours. Réessayez dans quelques instants.",
        },
        { status: 409 },
      );
    }
    try {
    const forceSupervisionRun = request.headers.get("x-supervision-force") === "1";
    const now = new Date();
    const currentHourUtc = now.getUTCHours();
    const expectedHourUtc = settings.supervisionExportCronHourUtc ?? 6;
    if (!forceSupervisionRun && currentHourUtc !== expectedHourUtc) {
      await db.collection(RUNS).insertOne({
        kind: "supervision_export_daily",
        createdAt: now,
        status: "SKIPPED_HOUR",
        summary: {
          expectedHourUtc,
          currentHourUtc,
        },
      });
      return NextResponse.json(
        {
          ok: true,
          skipped: true,
          reason: "Hors créneau horaire supervision",
          expectedHourUtc,
          currentHourUtc,
        },
        { status: 200 },
      );
    }

    const supervisionSummary = [
      `SLA supervision (${daily.windowLabel})`,
      `Contrats en attente: ${daily.dossiers.createdInWindow}`,
      `Cautions J+10: ${cautionsJ10.length}`,
      `Successions sans action: ${staleSuccession.length}`,
      `Format configuré: ${settings.supervisionExportFormat.toUpperCase()}`,
      "Export complet disponible dans Paramètres > Supervision.",
    ].join("\n");
    const generatedAt = new Date();
    const dailyCsv = summaryToCsv(daily);
    const attachment = await buildSupervisionAttachment(settings.supervisionExportFormat, {
      generatedAt,
      cautionsJ10: cautionsJ10.length,
      successionStale: staleSuccession.length,
      dailyCsv,
    });
    const artifactBase64 = attachment.content.toString("base64");

    await db.collection(RUNS).insertOne({
      kind: "supervision_export_daily",
      createdAt: generatedAt,
      status: "OK",
      summary: {
        format: settings.supervisionExportFormat,
        cautionsJ10: cautionsJ10.length,
        successionStale: staleSuccession.length,
        expectedHourUtc,
      },
      csvSnippet: dailyCsv.split("\n").slice(0, 20).join("\n"),
      artifact: {
        filename: attachment.filename,
        contentType: attachment.contentType,
        dataBase64: artifactBase64,
      },
    });

    const retentionDays = parsePositiveInt(process.env.SUPERVISION_ARTIFACT_RETENTION_DAYS, DEFAULT_ARTIFACT_RETENTION_DAYS);
    const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
    await db.collection(RUNS).updateMany(
      {
        kind: "supervision_export_daily",
        createdAt: { $lt: cutoff },
        artifact: { $exists: true },
      },
      {
        $unset: { artifact: "" },
        $set: { artifactPurgedAt: now },
      },
    );

    await appSettingsCollection.updateOne(
      { _id: "global" },
      {
        $set: {
          supervisionExportLastRunAt: generatedAt,
          supervisionExportLastStatus: "OK",
        },
      },
      { upsert: true },
    );

    await notifyRoleTargets(
      "CHEF_SERVICE",
      `Export supervision automatique (${settings.supervisionExportFormat.toUpperCase()})`,
      `Un export supervision automatique a été généré. Cautions J+10: ${cautionsJ10.length}, successions stale: ${staleSuccession.length}.`,
      {
        kind: "SUPERVISION_EXPORT",
        format: settings.supervisionExportFormat,
      },
    );

    if (settings.criticalWorkflowEmailEnabled && process.env.SMTP_HOST) {
      const users = await listActiveUsersByRole("CHEF_SERVICE");
      const emails = users.map((u) => u.email).filter((e): e is string => Boolean(e));
      if (emails.length > 0) {
        await sendSmtpEmail(
          emails,
          `Export supervision automatique (${settings.supervisionExportFormat.toUpperCase()})`,
          supervisionSummary,
          {
            attachments:
              settings.supervisionExportFormat === "csv" || settings.supervisionExportFormat === "xlsx"
                ? [
                    {
                      filename: attachment.filename,
                      contentType: attachment.contentType,
                      content: attachment.content,
                    },
                  ]
                : undefined,
          },
        );
      }
    } else {
      await broadcastCriticalEmailToRole(
        "CHEF_SERVICE",
        `Export supervision automatique (${settings.supervisionExportFormat.toUpperCase()})`,
        supervisionSummary,
      );
    }
    } catch (error) {
      await appSettingsCollection.updateOne(
        { _id: "global" },
        {
          $set: {
            supervisionExportLastRunAt: new Date(),
            supervisionExportLastStatus: "ERROR",
          },
        },
        { upsert: true },
      );
      await db.collection(RUNS).insertOne({
        kind: "supervision_export_daily",
        createdAt: new Date(),
        status: "ERROR",
        summary: {
          message: error instanceof Error ? error.message : "Erreur supervision export",
        },
      });
      return NextResponse.json(
        {
          ok: false,
          message: error instanceof Error ? error.message : "Erreur supervision export",
        },
        { status: 500 },
      );
    } finally {
      await releaseSupervisionLock(db, lockOwner);
    }
  }

  return NextResponse.json(
    {
      ok: true,
      daily,
      cautionsJ10Count: cautionsJ10.length,
      cautionsJ10Alerted: j10Dispatch.alerted,
      successionStaleCount: staleSuccession.length,
      successionStaleAlerted: successionStaleDispatch.alerted,
    },
    { status: 200 },
  );
}
