import { NextRequest, NextResponse } from "next/server";

import { ensureAppSettingsIndexes, getAppSettings } from "@/lib/lonaci/app-settings";
import { broadcastCriticalEmailToRole } from "@/lib/lonaci/critical-email";
import { buildReportSummary, summaryToCsv } from "@/lib/lonaci/reports";
import { ensureSuccessionIndexes, listSuccessionStaleAlerts } from "@/lib/lonaci/succession";
import { ensureSprint4Indexes, listCautionAlertsJ10 } from "@/lib/lonaci/sprint4";
import { getDatabase } from "@/lib/mongodb";

const RUNS = "report_cron_runs";

function authorizeCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const bearer = request.headers.get("authorization");
  if (bearer === `Bearer ${secret}`) return true;
  return request.headers.get("x-cron-secret") === secret;
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

  const daily = await buildReportSummary("daily");
  const staleSuccession = await listSuccessionStaleAlerts();
  const cautionsJ10 = await listCautionAlertsJ10();

  const db = await getDatabase();
  await db.collection(RUNS).insertOne({
    kind: "daily_jobs",
    createdAt: new Date(),
    summary: {
      dossiersTotal: daily.dossiers.total,
      cautionsJ10: cautionsJ10.length,
      successionStale: staleSuccession.length,
    },
    csvSnippet: summaryToCsv(daily).split("\n").slice(0, 12).join("\n"),
  });

  await ensureAppSettingsIndexes();
  const settings = await getAppSettings();
  if (settings.criticalWorkflowEmailEnabled && process.env.SMTP_HOST) {
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

  return NextResponse.json(
    {
      ok: true,
      daily,
      cautionsJ10Count: cautionsJ10.length,
      successionStaleCount: staleSuccession.length,
    },
    { status: 200 },
  );
}
