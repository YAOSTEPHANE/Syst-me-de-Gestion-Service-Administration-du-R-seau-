export const ADM_ROLES = [
  "AGENT",
  "CHEF_SECTION",
  "ASSIST_CDS",
  "CHEF_SERVICE",
] as const;

export type AdmrRole = (typeof ADM_ROLES)[number];

export const DOSSIER_STATUSES = [
  "BROUILLON",
  "SOUMIS",
  "VALIDE_N1",
  "VALIDE_N2",
  "FINALISE",
  "REJETE",
] as const;

export type DossierStatus = (typeof DOSSIER_STATUSES)[number];
