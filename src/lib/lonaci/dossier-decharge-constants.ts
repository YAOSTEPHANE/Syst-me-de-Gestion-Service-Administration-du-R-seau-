/** Libellés décharges (client + serveur) — sans dépendances Node. */

export const DECHARGE_PROVISOIRE_TITLE = "DÉCHARGE PROVISOIRE — DOSSIER INCOMPLET";
export const DECHARGE_PROVISOIRE_DISCLAIMER =
  "Ce document ne confère pas le statut de concessionnaire actif. Il atteste uniquement l’état provisoire de constitution du dossier.";

export const DECHARGE_DEFINITIVE_TITLE = "DÉCHARGE DÉFINITIVE — DOSSIER COMPLET";
export const DECHARGE_DEFINITIVE_MENTION = "DOSSIER COMPLET";
export const DECHARGE_DEFINITIVE_DESCRIPTION =
  "Lorsque la checklist est entièrement validée et la caution payée, une décharge définitive est générée (PDF officiel LONACI avec référence de paiement).";

/** Fiche remise au client après finalisation du contrat. */
export const DECHARGE_CONTRAT_TITLE = "FICHE DE DÉCHARGE — REMISE DU CONTRAT AU CLIENT";
export const DECHARGE_CONTRAT_MENTION = "CONTRAT REMIS AU CLIENT";
export const DECHARGE_CONTRAT_DESCRIPTION =
  "Document établi après finalisation du contrat, à remettre au client (nom, produit, PDV, agence, date et signataire LONACI).";

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

/** Contrat généré et dossier finalisé — fiche de décharge client. */
export function dossierEligibleDechargeContratRemise(dossierStatus: string, hasContratGenere: boolean): boolean {
  return dossierStatus === "FINALISE" && hasContratGenere;
}
