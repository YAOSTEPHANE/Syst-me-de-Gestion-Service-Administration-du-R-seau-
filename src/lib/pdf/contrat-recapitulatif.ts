import "server-only";

import type { DossierDocument, DossierValidationStep } from "@/lib/lonaci/types";

import {
  collectPdfBuffer,
  createPremiumPdfDocument,
  drawInformationCard,
  drawPaginatedTable,
  drawSection,
  drawStatusBadge,
  drawTitle,
  finalizePremiumPages,
  type PdfTableColumn,
  type PdfStatusTone,
} from ".";

function printable(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value instanceof Date) return value.toLocaleString("fr-FR");
  return JSON.stringify(value) ?? String(value);
}

function statusTone(status: string): PdfStatusTone {
  if (status.includes("REJET")) return "danger";
  if (status.includes("VALIDE") || status.includes("CLOTUR")) return "success";
  if (status.includes("ATTENTE") || status.includes("CONTROLE")) return "warning";
  return "info";
}

const HISTORY_COLUMNS: readonly PdfTableColumn<DossierValidationStep>[] = [
  { header: "Statut", width: 112, value: (row) => row.status },
  {
    header: "Date",
    width: 105,
    value: (row) => row.actedAt.toLocaleString("fr-FR"),
  },
  { header: "Intervenant", width: 115, value: (row) => row.actedByUserId },
  { header: "Commentaire", width: 167, value: (row) => row.comment },
];

export async function renderContratRecapitulatifPdf(
  dossier: DossierDocument,
  issuedAt = new Date(),
): Promise<Buffer> {
  const doc = createPremiumPdfDocument({
    metadata: {
      title: `Récapitulatif dossier contrat ${dossier.reference}`,
      subject: "Synthèse du dossier contrat et historique des validations",
      keywords: ["contrat", "dossier", "récapitulatif"],
      creationDate: issuedAt,
    },
  });

  return collectPdfBuffer(doc, () => {
    drawTitle(doc, "Récapitulatif du dossier contrat", `Référence ${dossier.reference}`);
    drawStatusBadge(doc, printable(dossier.status), statusTone(dossier.status));

    drawSection(doc, "Identification");
    drawInformationCard(doc, [
      { label: "Référence dossier", value: printable(dossier.reference) },
      { label: "Client", value: printable(dossier.lonaciClientId) },
      { label: "Concessionnaire", value: printable(dossier.concessionnaireId) },
      { label: "Agence", value: printable(dossier.agenceId) },
    ]);

    drawSection(doc, "Opération contractuelle");
    drawInformationCard(doc, [
      { label: "Produit", value: printable(dossier.payload.produitCode) },
      { label: "Type", value: printable(dossier.payload.operationType) },
      {
        label: "Date opération",
        value: printable(dossier.payload.dateOperation ?? dossier.payload.dateEffet),
      },
      { label: "Observations", value: printable(dossier.payload.observations) },
    ]);

    drawSection(doc, "Historique des validations");
    drawPaginatedTable(doc, {
      columns: HISTORY_COLUMNS,
      rows: dossier.history,
      emptyLabel: "Aucune validation enregistrée.",
      minRowHeight: 30,
    });

    finalizePremiumPages(doc, {
      reference: dossier.reference,
      issuedAt,
      documentLabel: "RÉCAPITULATIF CONTRAT",
    });
  });
}
