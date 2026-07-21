import "server-only";

import { ObjectId } from "mongodb";

import { deriveSuccessionVisibilityState } from "@/lib/auth/workflow-visibility";
import { getResolvedAlertThresholds } from "@/lib/lonaci/alert-thresholds";
import { restrictionToMongoAgenceFilter } from "@/lib/lonaci/list-agence-restriction";
import { appendAuditLog } from "@/lib/lonaci/audit";
import { SUCCESSION_STEP_LABELS, SUCCESSION_STEPS, type SuccessionStep } from "@/lib/lonaci/constants";
import { notifyRoleTargets } from "@/lib/lonaci/notifications";
import type { SuccessionCaseDocument } from "@/lib/lonaci/types";
import { getDatabase } from "@/lib/mongodb";

const COLLECTION = "succession_cases";

type StoredSuccession = Omit<SuccessionCaseDocument, "_id"> & {
  _id: ObjectId;
  staleAlertSentAt?: Date | null;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type SuccessionStaleAlertRow = {
  id: string;
  reference: string;
  concessionnaireId: string;
  agenceId: string | null;
  declaredAt: string;
  lastActivityAt: string;
  updatedAt: string;
  daysInactive: number;
  daysSinceDeclaration: number;
  stepsCompleted: number;
  nextStep: SuccessionStep | null;
  thresholdDays: number;
};

export interface SuccessionStaleAlertDispatchResult {
  scanned: number;
  alerted: number;
  skippedAlreadyNotified: number;
}

function nextStepKey(historyLength: number): SuccessionStep | null {
  if (historyLength >= SUCCESSION_STEPS.length) return null;
  return SUCCESSION_STEPS[historyLength];
}

/** Date de déclaration (étape 17 — première entrée d’historique ou création du dossier). */
export function successionDeclaredAt(row: Pick<StoredSuccession, "stepHistory" | "createdAt">): Date {
  const declaration = row.stepHistory.find((s) => s.step === "DECLARATION_DECES");
  return declaration?.completedAt ?? row.createdAt;
}

/** Dernière activité sur le dossier (étapes, validations, documents, checklist). */
export function successionLastActivityAt(
  row: Pick<
    StoredSuccession,
    "updatedAt" | "createdAt" | "stepHistory" | "validationN1At" | "validationN2At" | "documents" | "acteDeces"
  >,
): Date {
  const stamps: number[] = [row.updatedAt.getTime(), row.createdAt.getTime()];
  for (const step of row.stepHistory) {
    stamps.push(step.completedAt.getTime());
  }
  if (row.validationN1At) stamps.push(row.validationN1At.getTime());
  if (row.validationN2At) stamps.push(row.validationN2At.getTime());
  if (row.acteDeces?.uploadedAt) stamps.push(row.acteDeces.uploadedAt.getTime());
  for (const doc of row.documents ?? []) {
    stamps.push(doc.uploadedAt.getTime());
  }
  return new Date(Math.max(...stamps));
}

export function daysBetween(from: Date, to: Date = new Date()): number {
  return Math.floor((to.getTime() - from.getTime()) / MS_PER_DAY);
}

export function evaluateSuccessionStale(
  row: Pick<
    StoredSuccession,
    | "status"
    | "updatedAt"
    | "createdAt"
    | "stepHistory"
    | "validationN1At"
    | "validationN2At"
    | "documents"
    | "acteDeces"
  >,
  thresholdDays: number,
  now: Date = new Date(),
): { stale: boolean; daysInactive: number; daysSinceDeclaration: number; lastActivityAt: Date; declaredAt: Date } {
  const declaredAt = successionDeclaredAt(row);
  const lastActivityAt = successionLastActivityAt(row);
  const daysInactive = daysBetween(lastActivityAt, now);
  const daysSinceDeclaration = daysBetween(declaredAt, now);
  const stale =
    row.status === "OUVERT" &&
    daysSinceDeclaration >= thresholdDays &&
    daysInactive >= thresholdDays;
  return { stale, daysInactive, daysSinceDeclaration, lastActivityAt, declaredAt };
}

function mapStaleRow(row: StoredSuccession, thresholdDays: number): SuccessionStaleAlertRow {
  const { daysInactive, daysSinceDeclaration, lastActivityAt, declaredAt } = evaluateSuccessionStale(
    row,
    thresholdDays,
  );
  return {
    id: row._id.toHexString(),
    reference: row.reference,
    concessionnaireId: row.concessionnaireId,
    agenceId: row.agenceId,
    declaredAt: declaredAt.toISOString(),
    lastActivityAt: lastActivityAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    daysInactive,
    daysSinceDeclaration,
    stepsCompleted: row.stepHistory.length,
    nextStep: nextStepKey(row.stepHistory.length),
    thresholdDays,
  };
}

/**
 * Dossiers succession ouverts sans action depuis N jours après la déclaration (seuil paramétrable, défaut 30).
 */
export async function listSuccessionStaleAlerts(
  agenceId?: string | null,
  agenceIds?: string[],
): Promise<SuccessionStaleAlertRow[]> {
  const thr = await getResolvedAlertThresholds();
  const thresholdDays = thr.successionStaleDays;
  const db = await getDatabase();
  const prefilter = new Date(Date.now() - thresholdDays * MS_PER_DAY);
  const filter: Record<string, unknown> = {
    status: "OUVERT",
    deletedAt: null,
    updatedAt: { $lte: prefilter },
  };
  const agenceFilter = restrictionToMongoAgenceFilter({
    agenceId: agenceId?.trim() || undefined,
    agenceIds,
  });
  if (agenceFilter) {
    filter.agenceId = agenceFilter;
  }
  const rows = await db
    .collection<StoredSuccession>(COLLECTION)
    .find(filter)
    .sort({ updatedAt: 1 })
    .limit(500)
    .toArray();

  return rows
    .filter((row) => evaluateSuccessionStale(row, thresholdDays).stale)
    .map((row) => mapStaleRow(row, thresholdDays));
}

export async function countSuccessionStaleAlerts(
  agenceId?: string | null,
  agenceIds?: string[],
): Promise<number> {
  const items = await listSuccessionStaleAlerts(agenceId, agenceIds);
  return items.length;
}

/**
 * Notifications in-app automatiques si aucune action depuis le seuil après déclaration.
 * Réarmement si le dossier a été réactivé puis est de nouveau inactif.
 */
export async function dispatchAutomaticSuccessionStaleAlerts(): Promise<SuccessionStaleAlertDispatchResult> {
  const thr = await getResolvedAlertThresholds();
  const thresholdDays = thr.successionStaleDays;
  const db = await getDatabase();
  const prefilter = new Date(Date.now() - thresholdDays * MS_PER_DAY);
  const rows = await db
    .collection<StoredSuccession>(COLLECTION)
    .find({
      status: "OUVERT",
      deletedAt: null,
      updatedAt: { $lte: prefilter },
    })
    .limit(500)
    .toArray();

  let alerted = 0;
  let skippedAlreadyNotified = 0;
  const now = new Date();

  for (const row of rows) {
    const evalResult = evaluateSuccessionStale(row, thresholdDays, now);
    if (!evalResult.stale) continue;

    const lastActivityAt = evalResult.lastActivityAt;
    const sentAt = row.staleAlertSentAt ?? null;
    if (sentAt && lastActivityAt.getTime() <= sentAt.getTime()) {
      skippedAlreadyNotified += 1;
      continue;
    }

    const caseId = row._id.toHexString();
    const nextStep = nextStepKey(row.stepHistory.length);
    const nextLabel = nextStep ? SUCCESSION_STEP_LABELS[nextStep] : "—";
    const message = [
      `Succession ${row.reference} — aucune action depuis ${evalResult.daysInactive} jour(s) (seuil ${thresholdDays} j. après déclaration).`,
      `Déclaration il y a ${evalResult.daysSinceDeclaration} j. · prochaine étape : ${nextLabel}.`,
      "Ouvrez le dossier pour faire avancer le workflow.",
    ].join(" ");

    const visibilityState = deriveSuccessionVisibilityState(row);
    const targetRole =
      visibilityState === "EN_ATTENTE_N1"
        ? "CHEF_SECTION"
        : visibilityState === "EN_ATTENTE_N2"
          ? "ASSIST_CDS"
          : visibilityState === "EN_ATTENTE_FINALISATION"
            ? "CHEF_SERVICE"
            : null;
    if (!targetRole) continue;
    await notifyRoleTargets(
      targetRole,
      "Succession sans action (30 j.)",
      message,
      {
        kind: "SUCCESSION_STALE_30D",
        caseId,
        reference: row.reference,
        daysInactive: evalResult.daysInactive,
        daysSinceDeclaration: evalResult.daysSinceDeclaration,
        thresholdDays,
      },
      row.agenceId,
    );

    await appendAuditLog({
      entityType: "SUCCESSION",
      entityId: caseId,
      action: "SUCCESSION_STALE_30D_ALERT",
      userId: "system",
      details: {
        reference: row.reference,
        daysInactive: evalResult.daysInactive,
        daysSinceDeclaration: evalResult.daysSinceDeclaration,
        thresholdDays,
        lastActivityAt: lastActivityAt.toISOString(),
        declaredAt: evalResult.declaredAt.toISOString(),
      },
    });

    await db.collection<StoredSuccession>(COLLECTION).updateOne(
      { _id: row._id },
      { $set: { staleAlertSentAt: now } },
    );
    alerted += 1;
  }

  return { scanned: rows.length, alerted, skippedAlreadyNotified };
}

/** À appeler sur toute mutation métier pour permettre une nouvelle alerte si le dossier redevient inactif. */
export function successionStaleAlertResetFields(): { staleAlertSentAt: null } {
  return { staleAlertSentAt: null };
}
