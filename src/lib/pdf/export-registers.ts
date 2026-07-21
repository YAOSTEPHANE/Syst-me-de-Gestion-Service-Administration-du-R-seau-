import {
  collectPdfBuffer,
  createPremiumPdfDocument,
  finalizePremiumPages,
} from "./document";
import { drawInformationCard, drawSection, drawTitle } from "./primitives";
import { drawPaginatedTable, type PdfTableColumn } from "./table";

export interface PremiumExportOptions {
  generatedAt: Date;
  filters: readonly string[];
}

export interface AgrementExportRow {
  reference: string;
  produitCode: string;
  dateReception: string | Date;
  referenceOfficielle: string;
  agenceId: string | null;
  statut: string;
  observations: string | null;
}

export interface BancarisationExportRow {
  codePdv: string | null;
  nom: string;
  statutBancarisation: string;
  compteBancaire: string | null;
  banqueEtablissement: string | null;
  agenceId: string | null;
  produitsAutorises: readonly string[];
}

export interface ConcessionnaireExportRow {
  codePdv: string | null;
  codeTerminal: string | null;
  codeConcessionnaire: string | null;
  nom: string;
  cniNumero: string | null;
  telephonePrincipal: string | null;
  agenceId: string | null;
  statut: string;
}

export interface PdvIntegrationExportRow {
  reference: string;
  codePdv: string;
  agenceId: string | null;
  produitCode: string;
  nombreDemandes: number;
  dateDemande: string | Date;
  status: string;
  observations: string | null;
}

export interface AttestationDomiciliationExportRow {
  type: string;
  concessionnaireId: string | null;
  produitCode: string | null;
  dateDemande: string | Date;
  statut: string;
  observations: string | null;
}

interface ExportDefinition<Row> {
  title: string;
  subtitle: string;
  documentLabel: string;
  referencePrefix: string;
  orientation: "portrait" | "landscape";
  columns: readonly PdfTableColumn<Row>[];
}

function formatDate(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "short" }).format(date);
}

function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function buildReference(prefix: string, generatedAt: Date): string {
  const timestamp = generatedAt
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z")
    .replace(/[-:TZ]/g, "");
  return `${prefix}-${timestamp}`;
}

async function renderPremiumExport<Row>(
  definition: ExportDefinition<Row>,
  rows: readonly Row[],
  options: PremiumExportOptions,
): Promise<Buffer> {
  const reference = buildReference(definition.referencePrefix, options.generatedAt);
  const doc = createPremiumPdfDocument({
    orientation: definition.orientation,
    metadata: {
      title: definition.title,
      subject: definition.subtitle,
      keywords: ["LONACI", "export", "registre"],
      creationDate: options.generatedAt,
    },
  });

  return await collectPdfBuffer(doc, () => {
    drawTitle(doc, definition.title, definition.subtitle);
    drawInformationCard(
      doc,
      [
        { label: "Généré le", value: formatDateTime(options.generatedAt) },
        { label: "Enregistrements", value: String(rows.length) },
        {
          label: "Filtres actifs",
          value: options.filters.length > 0 ? options.filters.join(" · ") : "Aucun",
        },
      ],
      "Informations de l’export",
    );
    drawSection(doc, "Données exportées");
    drawPaginatedTable(doc, {
      columns: definition.columns,
      rows,
      emptyLabel: "Aucun enregistrement ne correspond aux filtres.",
    });
    finalizePremiumPages(doc, {
      reference,
      issuedAt: options.generatedAt,
      documentLabel: definition.documentLabel,
    });
  });
}

const AGREMENT_COLUMNS: readonly PdfTableColumn<AgrementExportRow>[] = [
  { header: "RÉFÉRENCE", width: 82, value: (row) => row.reference },
  { header: "PRODUIT", width: 62, value: (row) => row.produitCode },
  {
    header: "RÉCEPTION",
    width: 72,
    value: (row) => formatDate(row.dateReception),
  },
  { header: "RÉF. OFFICIELLE", width: 105, value: (row) => row.referenceOfficielle },
  { header: "AGENCE", width: 82, value: (row) => row.agenceId },
  { header: "STATUT", width: 72, value: (row) => row.statut },
  { header: "OBSERVATIONS", width: 210, value: (row) => row.observations },
];

const BANCARISATION_COLUMNS: readonly PdfTableColumn<BancarisationExportRow>[] = [
  { header: "CODE PDV", width: 72, value: (row) => row.codePdv },
  { header: "CONCESSIONNAIRE", width: 135, value: (row) => row.nom },
  { header: "STATUT", width: 92, value: (row) => row.statutBancarisation },
  { header: "COMPTE", width: 112, value: (row) => row.compteBancaire },
  { header: "BANQUE", width: 105, value: (row) => row.banqueEtablissement },
  { header: "AGENCE", width: 82, value: (row) => row.agenceId },
  {
    header: "PRODUITS",
    width: 87,
    value: (row) => row.produitsAutorises.join(", "),
  },
];

const CONCESSIONNAIRE_COLUMNS: readonly PdfTableColumn<ConcessionnaireExportRow>[] = [
  { header: "CODE PDV", width: 67, value: (row) => row.codePdv },
  { header: "TERMINAL", width: 70, value: (row) => row.codeTerminal },
  { header: "CODE CONS.", width: 78, value: (row) => row.codeConcessionnaire },
  { header: "NOM COMPLET", width: 130, value: (row) => row.nom },
  { header: "CNI", width: 84, value: (row) => row.cniNumero },
  { header: "TÉLÉPHONE", width: 100, value: (row) => row.telephonePrincipal },
  { header: "AGENCE", width: 82, value: (row) => row.agenceId },
  { header: "STATUT", width: 74, value: (row) => row.statut },
];

const PDV_INTEGRATION_COLUMNS: readonly PdfTableColumn<PdvIntegrationExportRow>[] = [
  { header: "RÉFÉRENCE", width: 82, value: (row) => row.reference },
  { header: "CODE PDV", width: 65, value: (row) => row.codePdv },
  { header: "AGENCE", width: 76, value: (row) => row.agenceId },
  { header: "PRODUIT", width: 62, value: (row) => row.produitCode },
  {
    header: "DEMANDES",
    width: 62,
    value: (row) => row.nombreDemandes,
    align: "right",
  },
  {
    header: "DATE",
    width: 72,
    value: (row) => formatDate(row.dateDemande),
  },
  { header: "STATUT", width: 86, value: (row) => row.status },
  { header: "OBSERVATIONS", width: 180, value: (row) => row.observations },
];

const ATTESTATION_COLUMNS: readonly PdfTableColumn<AttestationDomiciliationExportRow>[] = [
  { header: "TYPE", width: 82, value: (row) => row.type },
  { header: "CONCESSIONNAIRE", width: 92, value: (row) => row.concessionnaireId },
  { header: "PRODUIT", width: 55, value: (row) => row.produitCode },
  {
    header: "DATE",
    width: 68,
    value: (row) => formatDate(row.dateDemande),
  },
  { header: "STATUT", width: 70, value: (row) => row.statut },
  { header: "OBSERVATIONS", width: 128, value: (row) => row.observations },
];

export async function renderAgrementsExportPdf(
  rows: readonly AgrementExportRow[],
  options: PremiumExportOptions,
): Promise<Buffer> {
  return await renderPremiumExport(
    {
      title: "Synthèse des agréments",
      subtitle: "Registre des agréments selon le périmètre et les filtres autorisés",
      documentLabel: "EXPORT AGRÉMENTS",
      referencePrefix: "EXP-AGR",
      orientation: "landscape",
      columns: AGREMENT_COLUMNS,
    },
    rows,
    options,
  );
}

export async function renderBancarisationExportPdf(
  rows: readonly BancarisationExportRow[],
  options: PremiumExportOptions,
): Promise<Buffer> {
  return await renderPremiumExport(
    {
      title: "Synthèse de la bancarisation",
      subtitle: "Concessionnaires visibles disposant d’une demande de bancarisation",
      documentLabel: "EXPORT BANCARISATION",
      referencePrefix: "EXP-BAN",
      orientation: "landscape",
      columns: BANCARISATION_COLUMNS,
    },
    rows,
    options,
  );
}

export async function renderConcessionnairesExportPdf(
  rows: readonly ConcessionnaireExportRow[],
  options: PremiumExportOptions,
): Promise<Buffer> {
  return await renderPremiumExport(
    {
      title: "Registre des concessionnaires",
      subtitle: "Concessionnaires du périmètre agence autorisé",
      documentLabel: "EXPORT CONCESSIONNAIRES",
      referencePrefix: "EXP-CON",
      orientation: "landscape",
      columns: CONCESSIONNAIRE_COLUMNS,
    },
    rows,
    options,
  );
}

export async function renderPdvIntegrationsExportPdf(
  rows: readonly PdvIntegrationExportRow[],
  options: PremiumExportOptions,
): Promise<Buffer> {
  return await renderPremiumExport(
    {
      title: "Journal des intégrations PDV",
      subtitle: "Suivi des demandes d’intégration de points de vente",
      documentLabel: "EXPORT INTÉGRATIONS PDV",
      referencePrefix: "EXP-PDV",
      orientation: "landscape",
      columns: PDV_INTEGRATION_COLUMNS,
    },
    rows,
    options,
  );
}

export async function renderAttestationsDomiciliationExportPdf(
  rows: readonly AttestationDomiciliationExportRow[],
  options: PremiumExportOptions,
): Promise<Buffer> {
  return await renderPremiumExport(
    {
      title: "Attestations et domiciliations",
      subtitle: "Synthèse des demandes d’attestation de revenu et de domiciliation produit",
      documentLabel: "EXPORT ATTESTATIONS",
      referencePrefix: "EXP-ATT",
      orientation: "portrait",
      columns: ATTESTATION_COLUMNS,
    },
    rows,
    options,
  );
}
