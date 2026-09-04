export const MODULE_COURRIER_IDS = [
  "attestation-domiciliation",
  "succession",
  "cession",
  "delocalisation",
  "resiliation",
  "dossier",
  "agrement",
  "bancarisation",
] as const;

export type ModuleCourrierId = (typeof MODULE_COURRIER_IDS)[number];

export function isModuleCourrierId(value: string): value is ModuleCourrierId {
  return (MODULE_COURRIER_IDS as readonly string[]).includes(value);
}

/** Modèle éditable depuis l'administration. */
export type ModuleCourrierTemplate = {
  destinataire: string;
  objet: string;
  corps: string;
  signatureLabel: string;
};

/** Variables injectées lors de la génération du courrier. */
export type ModuleCourrierContext = {
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
};

export type ModuleCourrierRenderView = {
  reference: string;
  generatedAt: Date;
  expediteur: {
    nom: string;
    prenoms: string;
    contacts: string;
    codeTerminal: string;
  };
  destinataire: string;
  objet: string;
  corps: string;
  signatureLabel: string;
  signatureName: string;
  /** Titre affiché dans le PDF (défaut : Courrier officiel). */
  documentTitle?: string;
  /** Libellé en-tête / pied de page (défaut : COURRIER OFFICIEL). */
  documentLabel?: string;
  /** Type QR / mots-clés PDF. */
  documentKind?: string;
  /** Titre du bloc identité (défaut : EXPÉDITEUR). */
  expediteurLabel?: string;
};

export const MODULE_COURRIER_PLACEHOLDERS: Array<{ key: string; label: string }> = [
  { key: "{{nom}}", label: "Nom" },
  { key: "{{prenoms}}", label: "Prénoms" },
  { key: "{{nomComplet}}", label: "Nom complet" },
  { key: "{{telephone}}", label: "Téléphone" },
  { key: "{{email}}", label: "Email" },
  { key: "{{contacts}}", label: "Contacts (tél. · email)" },
  { key: "{{codeTerminal}}", label: "Code terminal" },
  { key: "{{codePdv}}", label: "Code PDV" },
  { key: "{{reference}}", label: "Référence dossier" },
  { key: "{{agence}}", label: "Agence" },
  { key: "{{ville}}", label: "Ville" },
  { key: "{{date}}", label: "Date (jj/mm/aaaa)" },
  { key: "{{dateLong}}", label: "Date longue" },
];
