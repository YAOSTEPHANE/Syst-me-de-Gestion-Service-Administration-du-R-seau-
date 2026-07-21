/** Statuts métier affichés pour une délocalisation. */
export const DELOCALISATION_STATUTS_METIER = [
  "EN_CONSTITUTION",
  "DOSSIER_COMPLET",
  "EN_VALIDATION",
  "DELOCALISATION_EFFECTIVE",
] as const;

export type DelocalisationStatutMetier = (typeof DELOCALISATION_STATUTS_METIER)[number];

/** Libellés métier affichés en majuscules dans l’interface. */
export const DELOCALISATION_STATUT_METIER_DISPLAY_LABELS: Record<DelocalisationStatutMetier, string> = {
  EN_CONSTITUTION: "EN CONSTITUTION",
  DOSSIER_COMPLET: "DOSSIER COMPLET",
  EN_VALIDATION: "EN VALIDATION",
  DELOCALISATION_EFFECTIVE: "DÉLOCALISATION EFFECTIVE",
};

/** Descriptions des statuts métier de délocalisation. */
export const DELOCALISATION_STATUT_METIER_DESCRIPTIONS: Record<DelocalisationStatutMetier, string> = {
  EN_CONSTITUTION: "Dossier en cours — Documents manquants",
  DOSSIER_COMPLET: "Checklist complète — Prêt pour validation",
  EN_VALIDATION: "Soumis au circuit de validation",
  DELOCALISATION_EFFECTIVE: "Zone mise à jour — Fiche concessionnaire actualisée",
};

/** Liste ordonnée destinée au tableau de bord et à l’aide. */
export const DELOCALISATION_STATUTS_SPEC_63 = DELOCALISATION_STATUTS_METIER.map((statut) => ({
  statut,
  label: DELOCALISATION_STATUT_METIER_DISPLAY_LABELS[statut],
  description: DELOCALISATION_STATUT_METIER_DESCRIPTIONS[statut],
}));
