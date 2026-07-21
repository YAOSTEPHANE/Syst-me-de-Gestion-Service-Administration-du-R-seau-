/** Statuts métier affichés pour la gestion des contrats. */
export const CONTRAT_STATUTS_METIER = [
  "DOSSIER_INCOMPLET",
  "DOSSIER_COMPLET",
  "CONTRAT_EN_VALIDATION",
  "CONCESSIONNAIRE_ACTIF",
  "RESILIE",
] as const;

export type ContratStatutMetier = (typeof CONTRAT_STATUTS_METIER)[number];

export const CONTRAT_STATUT_METIER_LABELS: Record<ContratStatutMetier, string> = {
  DOSSIER_INCOMPLET: "Dossier incomplet",
  DOSSIER_COMPLET: "Dossier complet",
  CONTRAT_EN_VALIDATION: "Contrat en validation",
  CONCESSIONNAIRE_ACTIF: "Concessionnaire actif",
  RESILIE: "Résilié",
};

/** Libellés métier affichés en majuscules dans l’interface. */
export const CONTRAT_STATUT_METIER_DISPLAY_LABELS: Record<ContratStatutMetier, string> = {
  DOSSIER_INCOMPLET: "DOSSIER INCOMPLET",
  DOSSIER_COMPLET: "DOSSIER COMPLET",
  CONTRAT_EN_VALIDATION: "CONTRAT EN VALIDATION",
  CONCESSIONNAIRE_ACTIF: "CONCESSIONNAIRE ACTIF",
  RESILIE: "RÉSILIÉ",
};

export const CONTRAT_STATUT_METIER_DESCRIPTIONS: Record<ContratStatutMetier, string> = {
  DOSSIER_INCOMPLET: "Checklist non complète — Décharge provisoire disponible",
  DOSSIER_COMPLET: "Checklist validée + caution payée — Prêt pour contrat",
  CONTRAT_EN_VALIDATION: "Contrat soumis au circuit N1 → N2 → Final",
  CONCESSIONNAIRE_ACTIF: "Contrat finalisé — Statut actif dans le réseau",
  RESILIE: "Contrat résilié — Archivé",
};
