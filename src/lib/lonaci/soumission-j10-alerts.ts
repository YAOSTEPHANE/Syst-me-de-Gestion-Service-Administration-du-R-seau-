import "server-only";

import { appendAuditLog } from "@/lib/lonaci/audit";
import { notifyRoleTargets, sendNotification } from "@/lib/lonaci/notifications";
import {
  SOUMISSION_CIRCUIT_OUVERTS,
  SOUMISSION_PAIEMENT_DELAI_JOURS,
  soumissionFicheCaisseReference,
  soumissionOverdueThreshold,
} from "@/lib/lonaci/soumission-circuit";
import { SOUMISSIONS_COLLECTION, type SoumissionStored } from "@/lib/lonaci/soumissions";
import { getDatabase } from "@/lib/mongodb";

export interface SoumissionJ10AlertDispatchResult {
  scanned: number;
  alerted: number;
}

/**
 * Alerte J+10 : soumissions dont la fiche caisse a été émise il y a plus de 10 jours
 * sans validation du paiement. Une seule alerte par soumission (`j10AlertSentAt`).
 */
export async function dispatchAutomaticSoumissionJ10Alerts(): Promise<SoumissionJ10AlertDispatchResult> {
  const db = await getDatabase();
  const col = db.collection<SoumissionStored>(SOUMISSIONS_COLLECTION);
  const now = new Date();
  const rows = await col
    .find({
      deletedAt: null,
      circuitStatut: { $in: [...SOUMISSION_CIRCUIT_OUVERTS] },
      circuitStartedAt: { $lte: soumissionOverdueThreshold(now) },
      j10AlertSentAt: null,
    })
    .toArray();

  let alerted = 0;
  for (const row of rows) {
    const soumissionId = row._id.toHexString();
    const reference = soumissionFicheCaisseReference(soumissionId);
    const started = row.circuitStartedAt ?? now;
    const days = Math.floor((now.getTime() - started.getTime()) / 86_400_000);
    const message = `Soumission ${reference} | ${row.nomComplet} (${row.produitCode}) | fiche caisse émise il y a ${days} jour(s) sans validation du paiement (délai J+${SOUMISSION_PAIEMENT_DELAI_JOURS}).`;
    const metadata = { soumissionId, reference, kind: "SOUMISSION_J10_OVERDUE", days };

    await notifyRoleTargets(
      "CHEF_SERVICE",
      `Soumission en retard J+${SOUMISSION_PAIEMENT_DELAI_JOURS}`,
      message,
      metadata,
      row.agenceId,
    );
    const emitter = row.fichePaiementGeneratedByUserId?.trim();
    if (emitter) {
      await sendNotification({
        userId: emitter,
        title: `Soumission en retard J+${SOUMISSION_PAIEMENT_DELAI_JOURS}`,
        message,
        metadata,
      });
    }
    await appendAuditLog({
      entityType: "SOUMISSION",
      entityId: soumissionId,
      action: "SOUMISSION_J10_ALERT",
      userId: "system",
      details: { reference, days },
    });
    await col.updateOne({ _id: row._id }, { $set: { j10AlertSentAt: now } });
    alerted += 1;
  }

  return { scanned: rows.length, alerted };
}
