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

export interface SuccessionPdfRow {
  reference: string;
  concessionnaireId: string;
  statutMetierLabel: string;
  stepsCompleted: number;
  stepsTotal: number;
  decisionType?: string | null;
  autoDossierContratReference?: string | null;
  updatedAt: string;
}

const COLUMNS: readonly PdfTableColumn<SuccessionPdfRow>[] = [
  { header: "Référence", width: 78, value: (row) => row.reference },
  { header: "Concessionnaire", width: 104, value: (row) => row.concessionnaireId },
  { header: "Statut", width: 136, value: (row) => row.statutMetierLabel },
  {
    header: "Progression",
    width: 62,
    value: (row) => `${row.stepsCompleted}/${row.stepsTotal}`,
    align: "center",
  },
  { header: "Décision", width: 72, value: (row) => row.decisionType },
  { header: "Dossier contrat", width: 92, value: (row) => row.autoDossierContratReference },
  {
    header: "Mise à jour",
    width: 60,
    value: (row) => new Date(row.updatedAt).toLocaleDateString("fr-FR"),
  },
];

export async function renderSuccessionsListPdf(
  rows: readonly SuccessionPdfRow[],
  issuedAt = new Date(),
): Promise<Buffer> {
  const doc = createPremiumPdfDocument({
    orientation: "landscape",
    metadata: {
      title: "Décès et ayants droit",
      subject: "Export des dossiers de succession",
      keywords: ["succession", "ayants droit", "décès"],
      creationDate: issuedAt,
    },
  });

  return collectPdfBuffer(doc, () => {
    drawTitle(doc, "Décès et ayants droit", "Suivi des dossiers de succession visibles");
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
      emptyLabel: "Aucun dossier de succession dans le périmètre sélectionné.",
    });
    finalizePremiumPages(doc, {
      reference: "SUCCESSIONS",
      issuedAt,
      documentLabel: "EXPORT SUCCESSIONS",
    });
  });
}
