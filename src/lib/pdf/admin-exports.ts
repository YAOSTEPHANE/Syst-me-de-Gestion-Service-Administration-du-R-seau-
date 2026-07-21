import {
  collectPdfBuffer,
  createPremiumPdfDocument,
  finalizePremiumPages,
} from "./document";
import {
  drawInformationCard,
  drawSection,
  drawTitle,
  type PdfField,
} from "./primitives";
import { drawPaginatedTable, type PdfTableColumn } from "./table";

export interface AdminAgenceExportRow {
  code: string;
  libelle: string;
  zone: string;
  statut: string;
  id: string;
}

export interface AdminProduitExportRow {
  code: string;
  libelle: string;
  prix: number;
  statut: string;
  id: string;
}

export interface AdminUserExportRow {
  nomComplet: string;
  email: string;
  matricule: string;
  role: string;
  agence: string;
  statut: string;
  derniereConnexion: Date | null;
}

export interface AdminAuthLogExportRow {
  attemptedAt: Date;
  status: string;
  email: string;
  ipAddress: string;
  reason: string;
}

interface RenderAdminExportOptions<Row> {
  title: string;
  subtitle: string;
  documentLabel: string;
  referencePrefix: string;
  generatedAt: Date;
  summaryFields: readonly PdfField[];
  columns: readonly PdfTableColumn<Row>[];
  rows: readonly Row[];
  emptyLabel: string;
}

const dateTimeFormatter = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "short",
  timeStyle: "medium",
});

const priceFormatter = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "XOF",
  maximumFractionDigits: 0,
});

function formatDateTime(value: Date | null): string {
  return value ? dateTimeFormatter.format(value) : "—";
}

function exportReference(prefix: string, generatedAt: Date): string {
  const timestamp = generatedAt
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z")
    .replace(/[-:TZ]/g, "");
  return `${prefix}-${timestamp}`;
}

async function renderAdminExport<Row>(
  options: RenderAdminExportOptions<Row>,
): Promise<Buffer> {
  const doc = createPremiumPdfDocument({
    orientation: "landscape",
    metadata: {
      title: options.title,
      subject: options.subtitle,
      creationDate: options.generatedAt,
      keywords: ["LONACI", "administration", "export"],
    },
  });
  const reference = exportReference(options.referencePrefix, options.generatedAt);

  return await collectPdfBuffer(doc, () => {
    drawTitle(doc, options.title, options.subtitle);
    drawInformationCard(
      doc,
      [
        {
          label: "Généré le",
          value: dateTimeFormatter.format(options.generatedAt),
        },
        { label: "Nombre de lignes", value: String(options.rows.length) },
        ...options.summaryFields,
      ],
      "Synthèse de l’export",
    );
    drawSection(doc, "Données exportées");
    drawPaginatedTable(doc, {
      columns: options.columns,
      rows: options.rows,
      emptyLabel: options.emptyLabel,
      rowPadding: 6,
      minRowHeight: 25,
    });
    finalizePremiumPages(doc, {
      reference,
      issuedAt: options.generatedAt,
      documentLabel: options.documentLabel,
    });
  });
}

const agenceColumns: readonly PdfTableColumn<AdminAgenceExportRow>[] = [
  { header: "CODE", width: 80, value: (row) => row.code },
  { header: "LIBELLÉ", width: 225, value: (row) => row.libelle },
  { header: "ZONE", width: 100, value: (row) => row.zone },
  { header: "STATUT", width: 90, value: (row) => row.statut, align: "center" },
  { header: "IDENTIFIANT", width: 245, value: (row) => row.id },
];

export async function renderAdminAgencesExportPdf(
  rows: readonly AdminAgenceExportRow[],
  generatedAt: Date,
): Promise<Buffer> {
  return await renderAdminExport({
    title: "Export des agences",
    subtitle: "Référentiel administratif des agences LONACI",
    documentLabel: "EXPORT AGENCES",
    referencePrefix: "EXP-AGENCES",
    generatedAt,
    summaryFields: [{ label: "Périmètre", value: "Toutes les agences" }],
    columns: agenceColumns,
    rows,
    emptyLabel: "Aucune agence.",
  });
}

const produitColumns: readonly PdfTableColumn<AdminProduitExportRow>[] = [
  { header: "CODE", width: 80, value: (row) => row.code },
  { header: "LIBELLÉ", width: 235, value: (row) => row.libelle },
  {
    header: "PRIX",
    width: 120,
    value: (row) => row.prix,
    format: (value) => priceFormatter.format(typeof value === "number" ? value : 0),
    align: "right",
  },
  { header: "STATUT", width: 90, value: (row) => row.statut, align: "center" },
  { header: "IDENTIFIANT", width: 215, value: (row) => row.id },
];

export async function renderAdminProduitsExportPdf(
  rows: readonly AdminProduitExportRow[],
  generatedAt: Date,
): Promise<Buffer> {
  return await renderAdminExport({
    title: "Export des produits",
    subtitle: "Référentiel administratif des produits LONACI",
    documentLabel: "EXPORT PRODUITS",
    referencePrefix: "EXP-PRODUITS",
    generatedAt,
    summaryFields: [{ label: "Périmètre", value: "Tous les produits" }],
    columns: produitColumns,
    rows,
    emptyLabel: "Aucun produit.",
  });
}

const userColumns: readonly PdfTableColumn<AdminUserExportRow>[] = [
  { header: "UTILISATEUR", width: 110, value: (row) => row.nomComplet },
  { header: "E-MAIL", width: 145, value: (row) => row.email },
  { header: "MATRICULE", width: 70, value: (row) => row.matricule },
  { header: "RÔLE", width: 85, value: (row) => row.role },
  { header: "AGENCE", width: 80, value: (row) => row.agence },
  { header: "STATUT", width: 65, value: (row) => row.statut, align: "center" },
  {
    header: "DERNIÈRE CONNEXION",
    width: 185,
    value: (row) => row.derniereConnexion,
    format: (value) => formatDateTime(value instanceof Date ? value : null),
  },
];

export interface AdminUsersExportFilters {
  status: string;
  role: string;
  agence: string;
  recherche: string;
}

export async function renderAdminUsersExportPdf(
  rows: readonly AdminUserExportRow[],
  filters: AdminUsersExportFilters,
  generatedAt: Date,
): Promise<Buffer> {
  return await renderAdminExport({
    title: "Export des utilisateurs",
    subtitle: "Registre administratif des comptes utilisateurs",
    documentLabel: "EXPORT UTILISATEURS",
    referencePrefix: "EXP-USERS",
    generatedAt,
    summaryFields: [
      { label: "Statut", value: filters.status },
      { label: "Rôle", value: filters.role },
      { label: "Agence", value: filters.agence },
      { label: "Recherche", value: filters.recherche || "—" },
    ],
    columns: userColumns,
    rows,
    emptyLabel: "Aucun utilisateur pour ces filtres.",
  });
}

const authLogColumns: readonly PdfTableColumn<AdminAuthLogExportRow>[] = [
  {
    header: "DATE ET HEURE",
    width: 125,
    value: (row) => row.attemptedAt,
    format: (value) => formatDateTime(value instanceof Date ? value : null),
  },
  { header: "STATUT", width: 75, value: (row) => row.status, align: "center" },
  { header: "E-MAIL", width: 155, value: (row) => row.email },
  { header: "ADRESSE IP", width: 105, value: (row) => row.ipAddress },
  { header: "MOTIF", width: 280, value: (row) => row.reason },
];

export interface AdminAuthLogsExportFilters {
  email: string;
  status: string;
  from: string;
  to: string;
}

export async function renderAdminAuthLogsExportPdf(
  rows: readonly AdminAuthLogExportRow[],
  filters: AdminAuthLogsExportFilters,
  generatedAt: Date,
): Promise<Buffer> {
  return await renderAdminExport({
    title: "Journal d’authentification",
    subtitle: "Traçabilité des tentatives d’accès à l’administration",
    documentLabel: "EXPORT AUTH-LOGS",
    referencePrefix: "EXP-AUTH",
    generatedAt,
    summaryFields: [
      { label: "E-mail", value: filters.email },
      { label: "Statut", value: filters.status },
      { label: "Du", value: filters.from },
      { label: "Au", value: filters.to },
    ],
    columns: authLogColumns,
    rows,
    emptyLabel: "Aucun log d’authentification pour ces filtres.",
  });
}
