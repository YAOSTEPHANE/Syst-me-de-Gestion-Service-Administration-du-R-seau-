import "server-only";

import type { CessionExportMeta, CessionExportRow } from "@/lib/lonaci/cessions-export";

import {
  collectPdfBuffer,
  createPremiumPdfDocument,
  drawInformationCard,
  drawPaginatedTable,
  drawTitle,
  finalizePremiumPages,
  type PdfTableColumn,
} from ".";

const COLUMNS: readonly PdfTableColumn<CessionExportRow>[] = [
  { header: "Référence", width: 76, value: (row) => row.reference },
  { header: "Cédant", width: 126, value: (row) => row.cedantLabel },
  { header: "Cessionnaire", width: 126, value: (row) => row.cessionnaireLabel },
  { header: "Date", width: 60, value: (row) => row.dateDemande },
  { header: "Statut", width: 104, value: (row) => row.statutLabel },
  { header: "Agence", width: 104, value: (row) => row.agenceLabel },
  { header: "Produit", width: 65, value: (row) => row.produitCode },
];

export async function renderCessionsListPdf(
  meta: CessionExportMeta,
  rows: readonly CessionExportRow[],
): Promise<Buffer> {
  const issuedAt = new Date(meta.generatedAt);
  const doc = createPremiumPdfDocument({
    orientation: "landscape",
    metadata: {
      title: "Liste des cessions",
      subject: "Export filtré des demandes de cession",
      keywords: ["cessions", "rapport", "contrôle"],
      creationDate: issuedAt,
    },
  });

  return collectPdfBuffer(doc, () => {
    drawTitle(doc, "Liste des cessions", "Export pour rapports mensuels et contrôles terrain");
    drawInformationCard(
      doc,
      [
        { label: "Filtres appliqués", value: meta.filtersSummary },
        { label: "Volume exporté", value: `${meta.total} ligne(s)` },
        { label: "Généré le", value: issuedAt.toLocaleString("fr-FR") },
      ],
      "Périmètre de l’export",
    );
    drawPaginatedTable(doc, {
      columns: COLUMNS,
      rows,
      emptyLabel: "Aucune demande ne correspond aux filtres sélectionnés.",
      minRowHeight: 28,
    });
    finalizePremiumPages(doc, {
      reference: `CESSIONS-${meta.kind}`,
      issuedAt,
      documentLabel: "EXPORT CESSIONS",
    });
  });
}
