import "server-only";

import { ObjectId } from "mongodb";

import { appendAuditLog } from "@/lib/lonaci/audit";
import type { CautionEncaissementMode } from "@/lib/lonaci/constants";
import { notifyRoleTargets, sendNotification } from "@/lib/lonaci/notifications";
import {
  isSoumissionCircuitStatut,
  resolveSoumissionCircuitActions,
  soumissionFicheCaisseReference,
  type SoumissionCircuitActions,
  type SoumissionCircuitStatut,
} from "@/lib/lonaci/soumission-circuit";
import type { SoumissionStatut } from "@/lib/lonaci/soumission-constants";
import {
  canAccessSoumissionRow,
  SOUMISSIONS_COLLECTION,
  soumissionToPublic,
  type SoumissionPublic,
  type SoumissionStored,
} from "@/lib/lonaci/soumissions";
import { userDisplayName, type UserDocument } from "@/lib/lonaci/types";
import { areWorkflowApprovalsEnabled } from "@/lib/lonaci/workflow-approvals";
import { getDatabase } from "@/lib/mongodb";

const COUNTERS_COLLECTION = "counters";
const FICHE_DEFINITIVE_COUNTER_PREFIX = "soumission_fds_";

export type SoumissionCircuitCommand =
  | { action: "FINALISER_PAYEE"; paymentMode: CautionEncaissementMode; paymentReference: string }
  | { action: "ANNULER"; motif: string }
  | { action: "EXONERER"; motif: string }
  | { action: "RETOUR_CORRECTION"; motif: string }
  | { action: "RENVOYER" };

type Transition = {
  permission: keyof SoumissionCircuitActions;
  next: SoumissionCircuitStatut;
  /** Statut de la file d'appels aligné sur l'issue du circuit. */
  statut?: SoumissionStatut;
  motif: string | null;
  closes: boolean;
};

async function loadAccessibleRow(id: string, actor: UserDocument): Promise<SoumissionStored> {
  if (!ObjectId.isValid(id)) throw new Error("SOUMISSION_NOT_FOUND");
  const db = await getDatabase();
  const row = await db
    .collection<SoumissionStored>(SOUMISSIONS_COLLECTION)
    .findOne({ _id: new ObjectId(id), deletedAt: null });
  if (!row || !canAccessSoumissionRow(row, actor)) throw new Error("SOUMISSION_NOT_FOUND");
  return row;
}

function currentStatut(row: SoumissionStored): SoumissionCircuitStatut | null {
  return isSoumissionCircuitStatut(row.circuitStatut) ? row.circuitStatut : null;
}

function requireMotif(motif: string): string {
  const trimmed = motif.trim();
  if (trimmed.length < 3) throw new Error("SOUMISSION_MOTIF_REQUIS");
  return trimmed;
}

function transitionFor(command: SoumissionCircuitCommand): Transition {
  switch (command.action) {
    case "FINALISER_PAYEE":
      return { permission: "finaliser", next: "PAYEE", statut: "CONVERTI", motif: null, closes: true };
    case "ANNULER":
      return {
        permission: "finaliser",
        next: "ANNULEE",
        statut: "SANS_SUITE",
        motif: requireMotif(command.motif),
        closes: true,
      };
    case "EXONERER":
      return {
        permission: "exonerer",
        next: "EXONEREE",
        statut: "CONVERTI",
        motif: requireMotif(command.motif),
        closes: true,
      };
    case "RETOUR_CORRECTION":
      return {
        permission: "correction",
        next: "A_CORRIGER",
        motif: requireMotif(command.motif),
        closes: false,
      };
    case "RENVOYER":
      return { permission: "renvoyer", next: "EN_ATTENTE", motif: null, closes: false };
    default: {
      const exhaustive: never = command;
      return exhaustive;
    }
  }
}

async function nextNumeroFicheDefinitive(now: Date): Promise<string> {
  const db = await getDatabase();
  const year = now.getUTCFullYear();
  const counter = await db
    .collection<{ _id: string; seq: number }>(COUNTERS_COLLECTION)
    .findOneAndUpdate(
      { _id: `${FICHE_DEFINITIVE_COUNTER_PREFIX}${year}` },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: "after" },
    );
  return `FDS-${year}-${String(counter?.seq ?? 1).padStart(6, "0")}`;
}

function emitterUserId(row: SoumissionStored): string {
  return row.fichePaiementGeneratedByUserId?.trim() || row.createdByUserId;
}

/** Démarre le circuit à la première fiche caisse ; sans effet si déjà démarré. */
export async function startSoumissionCircuit(input: { id: string; actor: UserDocument }): Promise<void> {
  const row = await loadAccessibleRow(input.id, input.actor);
  if (currentStatut(row)) return;

  const db = await getDatabase();
  const now = new Date();
  const actorName = userDisplayName(input.actor);
  const result = await db.collection<SoumissionStored>(SOUMISSIONS_COLLECTION).updateOne(
    { _id: row._id, circuitStatut: null },
    {
      $set: {
        circuitStatut: "EN_ATTENTE",
        circuitStartedAt: now,
        circuitMotif: null,
        statut: "EN_ATTENTE_PAIEMENT",
        appele: true,
        updatedAt: now,
        updatedByUserId: input.actor._id ?? "",
      },
      $unset: { paye: "" },
      $push: {
        circuitHistory: {
          action: "FICHE_CAISSE_EMISE",
          comment: null,
          actedAt: now,
          actedByUserId: input.actor._id ?? "",
          actedByName: actorName,
        },
      },
    },
  );
  if (result.modifiedCount === 0) return;

  const reference = soumissionFicheCaisseReference(row._id.toHexString());
  await appendAuditLog({
    entityType: "SOUMISSION",
    entityId: row._id.toHexString(),
    action: "SOUMISSION_CIRCUIT_START",
    userId: input.actor._id ?? "",
    details: { reference, produitCode: row.produitCode },
  });
  await notifyRoleTargets(
    "CHEF_SERVICE",
    "Soumission : validation du paiement attendue",
    `Soumission ${reference} | ${row.nomComplet} (${row.produitCode}) | fiche caisse émise par ${actorName} | finalisation attendue.`,
    { soumissionId: row._id.toHexString(), reference },
    row.agenceId,
  );
}

export async function applySoumissionCircuitCommand(input: {
  id: string;
  actor: UserDocument;
  command: SoumissionCircuitCommand;
}): Promise<SoumissionPublic> {
  const { command, actor } = input;
  const transition = transitionFor(command);
  const row = await loadAccessibleRow(input.id, actor);
  const from = currentStatut(row);
  const allowed = resolveSoumissionCircuitActions({
    role: actor.role,
    circuitStatut: from,
    approvalsEnabled: areWorkflowApprovalsEnabled(),
  });
  if (!allowed[transition.permission]) throw new Error("SOUMISSION_CIRCUIT_ACTION_FORBIDDEN");

  const now = new Date();
  const actorName = userDisplayName(actor);
  const $set: Record<string, unknown> = {
    circuitStatut: transition.next,
    circuitMotif: transition.motif,
    updatedAt: now,
    updatedByUserId: actor._id ?? "",
  };
  if (transition.statut) {
    $set.statut = transition.statut;
    $set.appele = true;
  }
  if (transition.closes) {
    $set.circuitFinalizedAt = now;
    $set.circuitFinalizedByName = actorName;
  }
  if (command.action === "FINALISER_PAYEE") {
    const paymentReference = command.paymentReference.trim();
    if (paymentReference.length < 3) throw new Error("SOUMISSION_REFERENCE_PAIEMENT_REQUISE");
    $set.paymentMode = command.paymentMode;
    $set.paymentReference = paymentReference;
    $set.numeroFicheDefinitive = await nextNumeroFicheDefinitive(now);
    $set.ficheDefinitiveEmiseLe = now;
  }

  const db = await getDatabase();
  const col = db.collection<SoumissionStored>(SOUMISSIONS_COLLECTION);
  const result = await col.updateOne(
    { _id: row._id, circuitStatut: from },
    {
      $set,
      $push: {
        circuitHistory: {
          action: command.action,
          comment: transition.motif,
          actedAt: now,
          actedByUserId: actor._id ?? "",
          actedByName: actorName,
        },
      },
    },
  );
  if (result.matchedCount === 0) throw new Error("SOUMISSION_CIRCUIT_CONFLICT");

  const soumissionId = row._id.toHexString();
  const reference = soumissionFicheCaisseReference(soumissionId);
  await appendAuditLog({
    entityType: "SOUMISSION",
    entityId: soumissionId,
    action: `SOUMISSION_${command.action}`,
    userId: actor._id ?? "",
    details: {
      reference,
      from,
      to: transition.next,
      motif: transition.motif,
      ...(command.action === "FINALISER_PAYEE"
        ? {
            paymentMode: command.paymentMode,
            paymentReference: $set.paymentReference,
            numeroFicheDefinitive: $set.numeroFicheDefinitive,
          }
        : {}),
    },
  });

  const metadata = { soumissionId, reference, circuitStatut: transition.next };
  if (command.action === "RENVOYER") {
    await notifyRoleTargets(
      "CHEF_SERVICE",
      "Soumission corrigée : validation attendue",
      `Soumission ${reference} | ${row.nomComplet} | corrigée et renvoyée par ${actorName}.`,
      metadata,
      row.agenceId,
    );
  } else {
    const titles: Record<Exclude<SoumissionCircuitCommand["action"], "RENVOYER">, string> = {
      FINALISER_PAYEE: "Soumission payée : fiche définitive émise",
      ANNULER: "Soumission annulée",
      EXONERER: "Soumission exonérée (Direction)",
      RETOUR_CORRECTION: "Soumission retournée pour correction",
    };
    const detail = transition.motif ? ` | motif : ${transition.motif}` : "";
    const fiche =
      command.action === "FINALISER_PAYEE" ? ` | fiche ${String($set.numeroFicheDefinitive)}` : "";
    await sendNotification({
      userId: emitterUserId(row),
      title: titles[command.action],
      message: `Soumission ${reference} | ${row.nomComplet}${fiche} | acteur ${actorName}${detail}.`,
      metadata,
    });
  }

  const updated = await col.findOne({ _id: row._id });
  if (!updated) throw new Error("SOUMISSION_NOT_FOUND");
  return soumissionToPublic(updated);
}
