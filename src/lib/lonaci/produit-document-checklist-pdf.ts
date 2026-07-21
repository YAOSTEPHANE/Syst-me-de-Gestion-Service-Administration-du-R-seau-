import "server-only";

import { DOSSIER_CHECKLIST_STATUT_LABELS } from "@/lib/lonaci/produit-document-checklist";
import type { DossierDocumentChecklistPayload } from "@/lib/lonaci/types";
import {
  collectPdfBuffer,
  createPremiumPdfDocument,
  drawBulletList,
  drawInformationCard,
  drawSection,
  drawStatusBadge,
  drawTitle,
  finalizePremiumPages,
} from "@/lib/pdf";

export interface DossierChecklistPdfView {
  dossierReference: string;
  produitCode: string;
  produitLibelle: string;
  concessionnaireLabel: string;
  checklist: DossierDocumentChecklistPayload;
  generatedAt: Date;
}

export async function renderDossierChecklistPdf(view: DossierChecklistPdfView): Promise<Buffer> {
  const doc = createPremiumPdfDocument({
    metadata: {
      title: "Checklist documents — constitution de dossier",
      subject: `Checklist du dossier ${view.dossierReference}`,
      creationDate: view.generatedAt,
    },
  });

  return await collectPdfBuffer(doc, () => {
    drawTitle(
      doc,
      "Checklist documents — constitution de dossier",
      `Référence dossier : ${view.dossierReference}`,
    );
    drawStatusBadge(
      doc,
      `État du dossier : ${view.checklist.complet ? "COMPLET" : "INCOMPLET"}`,
      view.checklist.complet ? "success" : "warning",
    );

    drawSection(doc, "Informations du dossier");
    drawInformationCard(doc, [
      { label: "Produit", value: `${view.produitCode} — ${view.produitLibelle}` },
      { label: "Concessionnaire", value: view.concessionnaireLabel },
      { label: "Généré le", value: view.generatedAt.toLocaleString("fr-FR") },
    ]);

    drawSection(doc, "Documents à constituer");
    const entries = view.checklist.entries.map((entry) => {
      const oblig = entry.obligatoire ? " (obligatoire)" : "";
      const statut = DOSSIER_CHECKLIST_STATUT_LABELS[entry.statut];
      return `${entry.libelle}${oblig} — ${statut}`;
    });
    drawBulletList(
      doc,
      entries,
      "Aucun document obligatoire configuré pour ce produit.",
    );

    finalizePremiumPages(doc, {
      reference: view.dossierReference,
      issuedAt: view.generatedAt,
      documentLabel: "CHECKLIST DOCUMENTS",
    });
  });
}
