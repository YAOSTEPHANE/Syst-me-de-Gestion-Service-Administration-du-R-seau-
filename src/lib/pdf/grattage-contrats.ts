import "server-only";

import type { GrattageContratListItem } from "@/lib/lonaci/grattage-contrats";

import {
  collectPdfBuffer,
  createPremiumPdfDocument,
  drawInformationCard,
  drawPaginatedTable,
  drawTitle,
  finalizePremiumPages,
  type PdfTableColumn,
} from ".";

const COLUMNS: readonly PdfTableColumn<GrattageContratListItem>[] = [
  { header: "Référence", width: 78, value: (row) => row.reference },
  { header: "Code PDV", width: 64, value: (row) => row.codePdv },
  { header: "Concessionnaire", width: 172, value: (row) => row.raisonSociale },
  { header: "Agence", width: 90, value: (row) => row.agenceId },
  { header: "Produit", width: 62, value: (row) => row.produitCode },
  { header: "Statut", width: 76, value: (row) => row.statutLabel },
  {
    header: "Début",
    width: 60,
    value: (row) => new Date(row.dateDebut).toLocaleDateString("fr-FR"),
  },
  {
    header: "Fin",
    width: 60,
    value: (row) => (row.dateFin ? new Date(row.dateFin).toLocaleDateString("fr-FR") : "—"),
  },
];

export async function renderGrattageContratsPdf(
  rows: readonly GrattageContratListItem[],
  issuedAt = new Date(),
): Promise<Buffer> {
  const doc = createPremiumPdfDocument({
    orientation: "landscape",
    metadata: {
      title: "Liste des contrats grattage",
      subject: "Export des contrats grattage",
      keywords: ["grattage", "contrats", "points de vente"],
      creationDate: issuedAt,
    },
  });

  return collectPdfBuffer(doc, () => {
    drawTitle(doc, "Liste des contrats grattage", "Suivi contractuel des points de vente");
    drawInformationCard(
      doc,
      [
        { label: "Nombre de contrats", value: String(rows.length) },
        { label: "Généré le", value: issuedAt.toLocaleString("fr-FR") },
      ],
      "Synthèse",
    );
    drawPaginatedTable(doc, {
      columns: COLUMNS,
      rows,
      emptyLabel: "Aucun contrat grattage dans le périmètre sélectionné.",
    });
    finalizePremiumPages(doc, {
      reference: "GRATTAGE-CONTRATS",
      issuedAt,
      documentLabel: "EXPORT CONTRATS GRATTAGE",
    });
  });
}
