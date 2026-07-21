/** Statuts métier affichés pour une cession. */
export const CESSION_STATUTS_METIER = [
  "EN_CONSTITUTION",
  "DOSSIER_COMPLET",
  "EN_VALIDATION",
  "ACTE_GENERE",
  "CESSION_FINALISEE",
] as const;

export type CessionStatutMetier = (typeof CESSION_STATUTS_METIER)[number];

/** Libellés métier affichés en majuscules dans l’interface. */
export const CESSION_STATUT_METIER_DISPLAY_LABELS: Record<CessionStatutMetier, string> = {
  EN_CONSTITUTION: "EN CONSTITUTION",
  DOSSIER_COMPLET: "DOSSIER COMPLET",
  EN_VALIDATION: "EN VALIDATION",
  ACTE_GENERE: "ACTE GÉNÉRÉ",
  CESSION_FINALISEE: "CESSION FINALISÉE",
};

/** Descriptions des statuts métier de cession. */
export const CESSION_STATUT_METIER_DESCRIPTIONS: Record<CessionStatutMetier, string> = {
  EN_CONSTITUTION: "Dossier en cours — Checklist incomplète",
  DOSSIER_COMPLET: "Tous les documents fournis — Prêt pour validation",
  EN_VALIDATION: "Soumis au circuit de validation",
  ACTE_GENERE: "Acte de cession produit et transmis",
  CESSION_FINALISEE: "Transfert effectif — Concessionnaire mis à jour",
};

/** Liste ordonnée destinée au tableau de bord et à l’aide. */
export const CESSION_STATUTS_SPEC_54 = CESSION_STATUTS_METIER.map((statut) => ({
  statut,
  label: CESSION_STATUT_METIER_DISPLAY_LABELS[statut],
  description: CESSION_STATUT_METIER_DESCRIPTIONS[statut],
}));
