import type { ModuleCourrierTemplate } from "@/lib/lonaci/module-courrier-types";

export const FAIRE_PART_KINDS = ["demande", "dr"] as const;
export type FairePartKind = (typeof FAIRE_PART_KINDS)[number];

export function isFairePartKind(value: string): value is FairePartKind {
  return (FAIRE_PART_KINDS as readonly string[]).includes(value);
}

/** Modèle éditable (même structure que le courrier). */
export type FairePartTemplate = ModuleCourrierTemplate;

/** Variables injectées pour un faire-part / demande (dossier succession). */
export type FairePartContext = {
  nom: string;
  prenoms: string;
  nomComplet: string;
  telephone: string;
  email: string;
  contacts: string;
  codeTerminal: string;
  codePdv: string;
  reference: string;
  agence: string;
  ville: string;
  date: string;
  dateLong: string;
  /** Nom du défunt (concessionnaire). */
  defunt: string;
  dateDeces: string;
  dateDecesLong: string;
  ayantDroit: string;
  lienParente: string;
};

export const FAIRE_PART_PLACEHOLDERS: Array<{ key: string; label: string }> = [
  { key: "{{nom}}", label: "Nom (émetteur / ayant droit)" },
  { key: "{{prenoms}}", label: "Prénoms" },
  { key: "{{nomComplet}}", label: "Nom complet" },
  { key: "{{telephone}}", label: "Téléphone" },
  { key: "{{email}}", label: "Email" },
  { key: "{{contacts}}", label: "Contacts (tél. · email)" },
  { key: "{{codeTerminal}}", label: "Code terminal du défunt" },
  { key: "{{codePdv}}", label: "Code PDV du défunt" },
  { key: "{{reference}}", label: "Référence dossier" },
  { key: "{{agence}}", label: "Agence" },
  { key: "{{ville}}", label: "Ville" },
  { key: "{{date}}", label: "Date d'édition" },
  { key: "{{dateLong}}", label: "Date d'édition (longue)" },
  { key: "{{defunt}}", label: "Nom du défunt (concessionnaire)" },
  { key: "{{dateDeces}}", label: "Date du décès" },
  { key: "{{dateDecesLong}}", label: "Date du décès (longue)" },
  { key: "{{ayantDroit}}", label: "Ayant droit" },
  { key: "{{lienParente}}", label: "Lien de parenté" },
];

export type FairePartKindMeta = {
  kind: FairePartKind;
  settingsId: string;
  adminTitle: string;
  adminDescription: string;
  documentTitle: string;
  documentLabel: string;
  documentKind: string;
  expediteurLabel: string;
  /** Exige un ayant droit identifié pour générer le PDF. */
  requireAyantDroit: boolean;
  filenamePrefix: string;
};

export const FAIRE_PART_KIND_META: Record<FairePartKind, FairePartKindMeta> = {
  demande: {
    kind: "demande",
    settingsId: "demande-faire-part",
    adminTitle: "Demande de faire-part (ayants droit)",
    adminDescription:
      "Modèle PDF rédigé au nom de l'ayant droit (même mise en page que le courrier officiel).",
    documentTitle: "Demande de faire-part",
    documentLabel: "FAIRE-PART · AYANT DROIT",
    documentKind: "LONACI_FAIRE_PART_DEMANDE",
    expediteurLabel: "AYANT DROIT",
    requireAyantDroit: true,
    filenamePrefix: "demande-faire-part",
  },
  dr: {
    kind: "dr",
    settingsId: "faire-part-dr",
    adminTitle: "Faire-part adressé au DR",
    adminDescription:
      "Faire-part notifiant le Directeur Régional du décès d'un concessionnaire (module Décès & ayants droit).",
    documentTitle: "Faire-part",
    documentLabel: "FAIRE-PART · DR",
    documentKind: "LONACI_FAIRE_PART_DR",
    expediteurLabel: "SERVICE LONACI",
    requireAyantDroit: false,
    filenamePrefix: "faire-part-dr",
  },
};
