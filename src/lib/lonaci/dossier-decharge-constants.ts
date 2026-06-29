/** Libellés décharges (client + serveur) — sans dépendances Node. */

export const DECHARGE_PROVISOIRE_TITLE = "DÉCHARGE PROVISOIRE — DOSSIER INCOMPLET";
export const DECHARGE_PROVISOIRE_DISCLAIMER =
  "Ce document ne confère pas le statut de concessionnaire actif. Il atteste uniquement l’état provisoire de constitution du dossier.";

export const DECHARGE_DEFINITIVE_TITLE = "DÉCHARGE DÉFINITIVE — DOSSIER COMPLET";
export const DECHARGE_DEFINITIVE_MENTION = "DOSSIER COMPLET";
export const DECHARGE_DEFINITIVE_DESCRIPTION =
  "Lorsque la checklist est entièrement validée et la caution payée, une décharge définitive est générée (PDF officiel LONACI avec référence de paiement).";

type ChecklistEligibility = {
  entries: unknown[];
  complet: boolean;
};

/** Checklist complète + caution payée + référence de paiement renseignée. */
export function dossierEligibleDechargeDefinitive(
  checklist: ChecklistEligibility,
  cautionPaid: boolean,
  hasPaymentReference: boolean,
): boolean {
  if (!checklist.entries.length) return false;
  if (!checklist.complet) return false;
  return cautionPaid && hasPaymentReference;
}
