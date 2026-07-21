/** Statuts métier affichés pour la gestion des cautions. */
export const CAUTION_STATUTS_METIER = ["EN_ATTENTE", "PAYEE", "EN_RETARD", "EXONEREE"] as const;

export type CautionStatutMetier = (typeof CAUTION_STATUTS_METIER)[number];

export const CAUTION_STATUT_METIER_LABELS: Record<CautionStatutMetier, string> = {
  EN_ATTENTE: "En attente",
  PAYEE: "Payée",
  EN_RETARD: "En retard",
  EXONEREE: "Exonérée",
};

export const CAUTION_STATUT_METIER_DESCRIPTIONS: Record<CautionStatutMetier, string> = {
  EN_ATTENTE: "Caution créée — paiement non encore effectué",
  PAYEE: "Paiement confirmé et validé — fiche définitive générée",
  EN_RETARD: "Délai J+10 dépassé sans paiement — alerte automatique",
  EXONEREE: "Caution exonérée sur décision de la Direction",
};

/** Statuts techniques encore en attente de paiement (hors EXONEREE / PAYEE / ANNULEE). */
export const CAUTION_PENDING_PAYMENT_STATUSES = [
  "EN_ATTENTE",
  "VALIDE_N1",
  "VALIDE_N2",
  "A_CORRIGER",
] as const;
