import "server-only";

import { ObjectId } from "mongodb";

import { getResolvedAlertThresholds } from "@/lib/lonaci/alert-thresholds";
import { appendAuditLog } from "@/lib/lonaci/audit";
import { CAUTION_PENDING_PAYMENT_STATUSES } from "@/lib/lonaci/caution-statut-metier";
import { resolveCautionStatutMetier } from "@/lib/lonaci/caution-statut-metier";
import { notifyRoleTargets } from "@/lib/lonaci/notifications";
import type { CautionDocument } from "@/lib/lonaci/types";
import { getDatabase } from "@/lib/mongodb";

const CAUTIONS_COLLECTION = "cautions";

type StoredCaution = Omit<CautionDocument, "_id"> & {
  _id: ObjectId;
  j10AlertSentAt?: Date | null;
};

export interface CautionJ10AlertDispatchResult {
  scanned: number;
  alerted: number;
  skippedAlreadyNotified: number;
}

function cautionAlertEntityId(row: StoredCaution): { entityType: "CONTRAT" | "CLIENT" | "CONCESSIONNAIRE"; entityId: string } {
  const cid = row.contratId?.trim();
  if (cid) return { entityType: "CONTRAT", entityId: cid };
  const pdv = row.concessionnaireId?.trim();
  if (pdv) return { entityType: "CONCESSIONNAIRE", entityId: pdv };
  const lid = row.lonaciClientId?.trim();
  if (lid) return { entityType: "CLIENT", entityId: lid };
  return { entityType: "CONTRAT", entityId: row._id.toHexString() };
}

/**
 * Alerte automatique J+10 : cautions dont le statut métier est EN RETARD (toujours en attente de paiement).
 * Une notification par caution au premier passage en retard (champ `j10AlertSentAt`).
 */
export async function dispatchAutomaticCautionJ10Alerts(): Promise<CautionJ10AlertDispatchResult> {
  const thr = await getResolvedAlertThresholds();
  const db = await getDatabase();
  const today = new Date();
  const threshold = new Date(today);
  threshold.setDate(today.getDate() - thr.cautionOverdueDays);

  const rows = await db
    .collection<StoredCaution>(CAUTIONS_COLLECTION)
    .find({
      deletedAt: null,
      status: { $in: [...CAUTION_PENDING_PAYMENT_STATUSES] },
      dueDate: { $lte: threshold },
      $or: [{ j10AlertSentAt: null }, { j10AlertSentAt: { $exists: false } }],
    })
    .toArray();

  let alerted = 0;
  let skippedAlreadyNotified = 0;

  for (const row of rows) {
    const statutMetier = resolveCautionStatutMetier({
      status: row.status,
      dueDate: row.dueDate,
      overdueThresholdDate: threshold,
    });
    if (statutMetier !== "EN_RETARD") {
      continue;
    }
    if (row.j10AlertSentAt) {
      skippedAlreadyNotified += 1;
      continue;
    }

    const cautionId = row._id.toHexString();
    const daysOverdue = Math.floor((today.getTime() - row.dueDate.getTime()) / (1000 * 60 * 60 * 24));
    const ref =
      row.numeroFicheProvisoire?.trim() ||
      (row.paymentReference?.startsWith("PROVISOIRE:")
        ? row.paymentReference.replace(/^PROVISOIRE:/i, "").trim()
        : row.paymentReference?.trim()) ||
      cautionId;

    const message = [
      `Caution en retard (J+${thr.cautionOverdueDays}) — statut EN ATTENTE de paiement.`,
      `Réf. ${ref} | montant ${row.montant.toLocaleString("fr-FR")} FCFA | retard ${daysOverdue} jour(s).`,
      "Régularisez le paiement puis finalisez en PAYÉE avec une référence de paiement valide.",
    ].join(" ");

    await notifyRoleTargets("CHEF_SECTION", "Caution en retard J+10", message, {
      cautionId,
      kind: "CAUTION_J10_OVERDUE",
      daysOverdue,
      montant: row.montant,
    });
    await notifyRoleTargets("CHEF_SERVICE", "Caution en retard J+10", message, {
      cautionId,
      kind: "CAUTION_J10_OVERDUE",
      daysOverdue,
      montant: row.montant,
    });
    await notifyRoleTargets("ASSIST_CDS", "Caution en retard J+10", message, {
      cautionId,
      kind: "CAUTION_J10_OVERDUE",
      daysOverdue,
      montant: row.montant,
    });

    const auditEnt = cautionAlertEntityId(row);
    await appendAuditLog({
      entityType: auditEnt.entityType,
      entityId: auditEnt.entityId,
      action: "CAUTION_J10_ALERT",
      userId: "system",
      details: {
        cautionId,
        daysOverdue,
        dueDate: row.dueDate.toISOString(),
        montant: row.montant,
      },
    });

    await db.collection<StoredCaution>(CAUTIONS_COLLECTION).updateOne(
      { _id: row._id },
      { $set: { j10AlertSentAt: today, updatedAt: today } },
    );
    alerted += 1;
  }

  return { scanned: rows.length, alerted, skippedAlreadyNotified };
}
