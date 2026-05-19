/** Statuts métier affichés (spec 5.4 — cession). */
export const CESSION_STATUTS_METIER = [
  "EN_CONSTITUTION",
  "DOSSIER_COMPLET",
  "EN_VALIDATION",
  "ACTE_GENERE",
  "CESSION_FINALISEE",
] as const;

export type CessionStatutMetier = (typeof CESSION_STATUTS_METIER)[number];

/** Libellés affichés en UI (spec 5.4 — majuscules métier). */
export const CESSION_STATUT_METIER_DISPLAY_LABELS: Record<CessionStatutMetier, string> = {
  EN_CONSTITUTION: "EN CONSTITUTION",
  DOSSIER_COMPLET: "DOSSIER COMPLET",
  EN_VALIDATION: "EN VALIDATION",
  ACTE_GENERE: "ACTE GÉNÉRÉ",
  CESSION_FINALISEE: "CESSION FINALISÉE",
};

/** Descriptions spec 5.4. */
export const CESSION_STATUT_METIER_DESCRIPTIONS: Record<CessionStatutMetier, string> = {
  EN_CONSTITUTION: "Dossier en cours — Checklist incomplète",
  DOSSIER_COMPLET: "Tous les documents fournis — Prêt pour validation",
  EN_VALIDATION: "Soumis au circuit de validation",
  ACTE_GENERE: "Acte de cession produit et transmis",
  CESSION_FINALISEE: "Transfert effectif — Concessionnaire mis à jour",
};

/** Liste ordonnée spec 5.4 pour affichage (tableau de bord, aide). */
export const CESSION_STATUTS_SPEC_54 = CESSION_STATUTS_METIER.map((statut) => ({
  statut,
  label: CESSION_STATUT_METIER_DISPLAY_LABELS[statut],
  description: CESSION_STATUT_METIER_DESCRIPTIONS[statut],
}));
