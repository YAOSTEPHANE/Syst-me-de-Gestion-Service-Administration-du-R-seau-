import type { UnifiedAuditLogItem } from "@/lib/lonaci/audit-logs";
import type { MonitoringEventListItem } from "@/lib/observability/events";

import {
  collectPdfBuffer,
  createPremiumPdfDocument,
  finalizePremiumPages,
} from "./document";
import { drawInformationCard, drawSection, drawTitle } from "./primitives";
import { drawPaginatedTable, type PdfTableColumn } from "./table";

const PDF_AUTHOR = "LONACI — Supervision";
const PDF_LOCALE = "fr-FR";

interface SlaRow {
  module: string;
  pending: number;
  overdue: number;
}

export interface SupervisionExportPdfInput {
  generatedAt: Date;
  filters: {
    source?: "AUTH" | "MONITORING";
    status?: "SUCCESS" | "FAILED" | "OPEN" | "ACK";
    agence: string;
    slaStatus: "ALL" | "OVERDUE";
    query?: string;
    from?: string;
    to?: string;
  };
  slaRows: readonly SlaRow[];
  auditLogs: readonly UnifiedAuditLogItem[];
  auditTotal: number;
  auditLimit: number;
}

export interface MonitoringEventsPdfInput {
  generatedAt: Date;
  filters: {
    code?: string;
    status?: "OPEN" | "ACK";
  };
  events: readonly MonitoringEventListItem[];
  total: number;
  limit: number;
}

export interface DailySupervisionPdfInput {
  generatedAt: Date;
  cautionsJ10: number;
  successionStale: number;
  dailyCsv: string;
  previewLimit: number;
}

interface CsvPreviewRow {
  line: number;
  content: string;
}

function formatDateTime(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat(PDF_LOCALE, {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(date);
}

function reference(prefix: string, generatedAt: Date): string {
  const stamp = generatedAt.toISOString().replace(/\D/g, "").slice(0, 14);
  return `${prefix}-${stamp}`;
}

function displayFilter(value: string | undefined): string {
  return value?.trim() || "Tous";
}

const slaColumns: readonly PdfTableColumn<SlaRow>[] = [
  { header: "MODULE", width: 250, value: (row) => row.module },
  { header: "EN ATTENTE", width: 110, value: (row) => row.pending, align: "right" },
  { header: "EN RETARD", width: 110, value: (row) => row.overdue, align: "right" },
];

const auditColumns: readonly PdfTableColumn<UnifiedAuditLogItem>[] = [
  {
    header: "DATE",
    width: 95,
    value: (row) => formatDateTime(row.timestamp),
  },
  { header: "SOURCE", width: 58, value: (row) => row.source },
  { header: "STATUT", width: 58, value: (row) => row.status },
  { header: "CODE", width: 70, value: (row) => row.code },
  { header: "TITRE", width: 120, value: (row) => row.title },
  { header: "MESSAGE", width: 195, value: (row) => row.message },
  { header: "ACTEUR", width: 80, value: (row) => row.actor },
  { header: "CIBLE", width: 65, value: (row) => row.targetRole },
];

const monitoringColumns: readonly PdfTableColumn<MonitoringEventListItem>[] = [
  {
    header: "DATE",
    width: 95,
    value: (row) => formatDateTime(row.createdAt),
  },
  { header: "CODE", width: 75, value: (row) => row.code },
  { header: "STATUT", width: 58, value: (row) => row.status },
  { header: "CIBLE", width: 82, value: (row) => row.roleTarget },
  { header: "TITRE", width: 145, value: (row) => row.title },
  { header: "MESSAGE", width: 286, value: (row) => row.message },
];

const csvPreviewColumns: readonly PdfTableColumn<CsvPreviewRow>[] = [
  { header: "LIGNE", width: 58, value: (row) => row.line, align: "right" },
  { header: "CONTENU CSV", width: 400, value: (row) => row.content },
];

export async function renderSupervisionExportPdf(
  input: SupervisionExportPdfInput,
): Promise<Buffer> {
  const documentReference = reference("SUP", input.generatedAt);
  const doc = createPremiumPdfDocument({
    orientation: "landscape",
    metadata: {
      title: "Export de supervision consolidée",
      subject: "SLA métier et journal d’audit",
      author: PDF_AUTHOR,
      keywords: ["supervision", "SLA", "audit"],
      creationDate: input.generatedAt,
    },
  });

  return await collectPdfBuffer(doc, () => {
    drawTitle(
      doc,
      "Export de supervision consolidée",
      "Synthèse des retards métier et traçabilité des événements",
    );
    drawInformationCard(
      doc,
      [
        { label: "Généré le", value: formatDateTime(input.generatedAt) },
        { label: "Périmètre agence", value: input.filters.agence },
        {
          label: "Filtres audit",
          value: `Source : ${displayFilter(input.filters.source)} · Statut : ${displayFilter(input.filters.status)} · Recherche : ${displayFilter(input.filters.query)}`,
        },
        {
          label: "Période",
          value: `${displayFilter(input.filters.from)} → ${displayFilter(input.filters.to)}`,
        },
        {
          label: "Volume",
          value: `${input.auditLogs.length} entrée(s) exportée(s) sur ${input.auditTotal} · limite ${input.auditLimit}`,
        },
      ],
      "Métadonnées d’export",
    );

    drawSection(doc, `SLA / retards métier — ${input.filters.slaStatus}`);
    drawPaginatedTable(doc, {
      columns: slaColumns,
      rows: input.slaRows,
      emptyLabel: "Aucun retard métier pour ces filtres.",
    });

    drawSection(doc, `Journal d’audit — ${input.auditLimit} entrées maximum`);
    drawPaginatedTable(doc, {
      columns: auditColumns,
      rows: input.auditLogs,
      emptyLabel: "Aucune entrée d’audit pour ces filtres.",
      minRowHeight: 30,
    });

    finalizePremiumPages(doc, {
      reference: documentReference,
      issuedAt: input.generatedAt,
      documentLabel: "SUPERVISION",
    });
  });
}

export async function renderMonitoringEventsPdf(
  input: MonitoringEventsPdfInput,
): Promise<Buffer> {
  const documentReference = reference("MON", input.generatedAt);
  const doc = createPremiumPdfDocument({
    orientation: "landscape",
    metadata: {
      title: "Export des événements de monitoring",
      subject: "Registre des événements critiques",
      author: PDF_AUTHOR,
      keywords: ["monitoring", "événements", "alertes"],
      creationDate: input.generatedAt,
    },
  });

  return await collectPdfBuffer(doc, () => {
    drawTitle(
      doc,
      "Export des événements de monitoring",
      "Registre opérationnel des alertes critiques",
    );
    drawInformationCard(
      doc,
      [
        { label: "Généré le", value: formatDateTime(input.generatedAt) },
        { label: "Code", value: displayFilter(input.filters.code) },
        { label: "Statut", value: displayFilter(input.filters.status) },
        {
          label: "Volume",
          value: `${input.events.length} événement(s) exporté(s) sur ${input.total} · limite ${input.limit}`,
        },
      ],
      "Métadonnées d’export",
    );
    drawSection(doc, "Événements");
    drawPaginatedTable(doc, {
      columns: monitoringColumns,
      rows: input.events,
      emptyLabel: "Aucun événement pour ces filtres.",
      minRowHeight: 32,
    });
    finalizePremiumPages(doc, {
      reference: documentReference,
      issuedAt: input.generatedAt,
      documentLabel: "MONITORING",
    });
  });
}

export async function renderDailySupervisionPdf(
  input: DailySupervisionPdfInput,
): Promise<Buffer> {
  const documentReference = reference("SUP-AUTO", input.generatedAt);
  const previewRows = input.dailyCsv
    .split(/\r?\n/)
    .slice(0, input.previewLimit)
    .map((content, index) => ({ line: index + 1, content }));
  const doc = createPremiumPdfDocument({
    metadata: {
      title: "Export de supervision automatique",
      subject: "Rapport journalier archivé",
      author: PDF_AUTHOR,
      keywords: ["supervision", "quotidien", "automatique"],
      creationDate: input.generatedAt,
    },
  });

  return await collectPdfBuffer(doc, () => {
    drawTitle(
      doc,
      "Export de supervision automatique",
      "Rapport journalier généré par la tâche planifiée",
    );
    drawInformationCard(
      doc,
      [
        { label: "Généré le", value: formatDateTime(input.generatedAt) },
        { label: "Cautions J+10", value: String(input.cautionsJ10) },
        { label: "Successions sans action", value: String(input.successionStale) },
        {
          label: "Aperçu",
          value: `${previewRows.length} ligne(s) CSV · limite ${input.previewLimit}`,
        },
      ],
      "Indicateurs de supervision",
    );
    drawSection(doc, "Aperçu du rapport journalier");
    drawPaginatedTable(doc, {
      columns: csvPreviewColumns,
      rows: previewRows,
      emptyLabel: "Aucune donnée dans le rapport journalier.",
      minRowHeight: 25,
    });
    finalizePremiumPages(doc, {
      reference: documentReference,
      issuedAt: input.generatedAt,
      documentLabel: "RAPPORT AUTOMATIQUE",
    });
  });
}
