/** Statuts métier affichés pour une résiliation. */
export const RESILIATION_STATUTS_METIER = [
  "EN_CONSTITUTION",
  "DOSSIER_COMPLET",
  "EN_VALIDATION",
  "RESILIEE",
] as const;

export type ResiliationStatutMetier = (typeof RESILIATION_STATUTS_METIER)[number];

/** Libellés métier affichés en majuscules dans l’interface. */
export const RESILIATION_STATUT_METIER_DISPLAY_LABELS: Record<ResiliationStatutMetier, string> = {
  EN_CONSTITUTION: "EN CONSTITUTION",
  DOSSIER_COMPLET: "DOSSIER COMPLET",
  EN_VALIDATION: "EN VALIDATION",
  RESILIEE: "RÉSILIÉ",
};

/** Descriptions des statuts métier de résiliation. */
export const RESILIATION_STATUT_METIER_DESCRIPTIONS: Record<ResiliationStatutMetier, string> = {
  EN_CONSTITUTION: "Dossier incomplet — Checklist en cours",
  DOSSIER_COMPLET: "Checklist validée — Prêt pour traitement",
  EN_VALIDATION: "Soumis au circuit N1 → N2 → Final",
  RESILIEE: "Contrat résilié — Concessionnaire archivé",
};

/** Liste ordonnée destinée au tableau de bord et à l’aide. */
export const RESILIATION_STATUTS_SPEC_72 = RESILIATION_STATUTS_METIER.map((statut) => ({
  statut,
  label: RESILIATION_STATUT_METIER_DISPLAY_LABELS[statut],
  description: RESILIATION_STATUT_METIER_DESCRIPTIONS[statut],
}));
