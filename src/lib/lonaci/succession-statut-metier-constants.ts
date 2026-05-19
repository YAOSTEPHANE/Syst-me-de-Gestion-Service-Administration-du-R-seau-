/** Statuts métier succession — §10.3 */
export const SUCCESSION_STATUTS_METIER = [
  "DECLARE",
  "DOSSIER_COMPLET",
  "EN_INSTRUCTION",
  "TRANSFERT_EFFECTUE",
  "RESILIE",
] as const;

export type SuccessionStatutMetier = (typeof SUCCESSION_STATUTS_METIER)[number];

export const SUCCESSION_STATUTS_SPEC_103: Array<{
  statut: SuccessionStatutMetier;
  libelle: string;
  description: string;
}> = [
  {
    statut: "DECLARE",
    libelle: "DÉCLARÉ",
    description: "Décès déclaré — Dossier en constitution",
  },
  {
    statut: "DOSSIER_COMPLET",
    libelle: "DOSSIER COMPLET",
    description: "Checklist validée — Prêt pour instruction",
  },
  {
    statut: "EN_INSTRUCTION",
    libelle: "EN INSTRUCTION",
    description: "Vérification juridique en cours",
  },
  {
    statut: "TRANSFERT_EFFECTUE",
    libelle: "TRANSFERT EFFECTUÉ",
    description: "Contrat transféré à l'ayant droit — Nouveau concessionnaire",
  },
  {
    statut: "RESILIE",
    libelle: "RÉSILIÉ",
    description: "Dossier clos par résiliation du contrat",
  },
];

export const SUCCESSION_STATUT_METIER_DISPLAY_LABELS: Record<SuccessionStatutMetier, string> =
  Object.fromEntries(SUCCESSION_STATUTS_SPEC_103.map((r) => [r.statut, r.libelle])) as Record<
    SuccessionStatutMetier,
    string
  >;

export const SUCCESSION_STATUT_METIER_DESCRIPTIONS: Record<SuccessionStatutMetier, string> =
  Object.fromEntries(SUCCESSION_STATUTS_SPEC_103.map((r) => [r.statut, r.description])) as Record<
    SuccessionStatutMetier,
    string
  >;
