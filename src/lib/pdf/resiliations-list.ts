import "server-only";

import {
  collectPdfBuffer,
  createPremiumPdfDocument,
  drawInformationCard,
  drawPaginatedTable,
  drawTitle,
  finalizePremiumPages,
  type PdfTableColumn,
} from ".";

export interface ResiliationPdfRow {
  id: string;
  concessionnaireId: string;
  produitCode: string;
  dateReception: string;
  statutLabel: string;
  motif: string;
  commentaire: string | null;
  validatedAt: string | null;
}

const COLUMNS: readonly PdfTableColumn<ResiliationPdfRow>[] = [
  { header: "ID", width: 88, value: (row) => row.id },
  { header: "Concessionnaire", width: 110, value: (row) => row.concessionnaireId },
  { header: "Produit", width: 58, value: (row) => row.produitCode },
  {
    header: "Réception",
    width: 72,
    value: (row) => new Date(row.dateReception).toLocaleDateString("fr-FR"),
  },
  { header: "Statut", width: 95, value: (row) => row.statutLabel },
  { header: "Motif", width: 108, value: (row) => row.motif },
  { header: "Commentaire", width: 95, value: (row) => row.commentaire },
  {
    header: "Validation",
    width: 92,
    value: (row) =>
      row.validatedAt ? new Date(row.validatedAt).toLocaleDateString("fr-FR") : "—",
  },
];

export async function renderResiliationsListPdf(
  rows: readonly ResiliationPdfRow[],
  issuedAt = new Date(),
): Promise<Buffer> {
  const doc = createPremiumPdfDocument({
    orientation: "landscape",
    metadata: {
      title: "Résiliations",
      subject: "Export de la liste des résiliations",
      keywords: ["résiliations", "contrats", "suivi"],
      creationDate: issuedAt,
    },
  });

  return collectPdfBuffer(doc, () => {
    drawTitle(doc, "Résiliations", "Liste des dossiers visibles selon les filtres sélectionnés");
    drawInformationCard(
      doc,
      [
        { label: "Nombre de dossiers", value: String(rows.length) },
        { label: "Généré le", value: issuedAt.toLocaleString("fr-FR") },
      ],
      "Synthèse",
    );
    drawPaginatedTable(doc, {
      columns: COLUMNS,
      rows,
      emptyLabel: "Aucune résiliation dans le périmètre sélectionné.",
    });
    finalizePremiumPages(doc, {
      reference: "RESILIATIONS",
      issuedAt,
      documentLabel: "EXPORT RÉSILIATIONS",
    });
  });
}
