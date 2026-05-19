/** Statuts métier affichés (spec 6.3 — délocalisation). */
export const DELOCALISATION_STATUTS_METIER = [
  "EN_CONSTITUTION",
  "DOSSIER_COMPLET",
  "EN_VALIDATION",
  "DELOCALISATION_EFFECTIVE",
] as const;

export type DelocalisationStatutMetier = (typeof DELOCALISATION_STATUTS_METIER)[number];

/** Libellés affichés en UI (spec 6.3 — majuscules métier). */
export const DELOCALISATION_STATUT_METIER_DISPLAY_LABELS: Record<DelocalisationStatutMetier, string> = {
  EN_CONSTITUTION: "EN CONSTITUTION",
  DOSSIER_COMPLET: "DOSSIER COMPLET",
  EN_VALIDATION: "EN VALIDATION",
  DELOCALISATION_EFFECTIVE: "DÉLOCALISATION EFFECTIVE",
};

/** Descriptions spec 6.3. */
export const DELOCALISATION_STATUT_METIER_DESCRIPTIONS: Record<DelocalisationStatutMetier, string> = {
  EN_CONSTITUTION: "Dossier en cours — Documents manquants",
  DOSSIER_COMPLET: "Checklist complète — Prêt pour validation",
  EN_VALIDATION: "Soumis au circuit de validation",
  DELOCALISATION_EFFECTIVE: "Zone mise à jour — Fiche concessionnaire actualisée",
};

/** Liste ordonnée spec 6.3 pour affichage (tableau de bord, aide). */
export const DELOCALISATION_STATUTS_SPEC_63 = DELOCALISATION_STATUTS_METIER.map((statut) => ({
  statut,
  label: DELOCALISATION_STATUT_METIER_DISPLAY_LABELS[statut],
  description: DELOCALISATION_STATUT_METIER_DESCRIPTIONS[statut],
}));
