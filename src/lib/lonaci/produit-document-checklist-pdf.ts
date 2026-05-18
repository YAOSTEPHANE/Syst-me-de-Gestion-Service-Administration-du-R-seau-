import "server-only";

import PDFDocument from "pdfkit";

import {
  DOSSIER_CHECKLIST_STATUT_LABELS,
} from "@/lib/lonaci/produit-document-checklist";
import type { DossierDocumentChecklistPayload } from "@/lib/lonaci/types";

export interface DossierChecklistPdfView {
  dossierReference: string;
  produitCode: string;
  produitLibelle: string;
  concessionnaireLabel: string;
  checklist: DossierDocumentChecklistPayload;
  generatedAt: Date;
}

export async function renderDossierChecklistPdf(view: DossierChecklistPdfView): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(16).fillColor("#0f172a").text("LONACI", { align: "center" });
    doc.moveDown(0.3);
    doc.fontSize(12).text("Checklist documents — constitution de dossier", { align: "center" });
    doc.moveDown(1);

    doc.fontSize(10).fillColor("#334155");
    doc.text(`Référence dossier : ${view.dossierReference}`);
    doc.text(`Produit : ${view.produitCode} — ${view.produitLibelle}`);
    doc.text(`Concessionnaire : ${view.concessionnaireLabel}`);
    doc.text(`Généré le : ${view.generatedAt.toLocaleString("fr-FR")}`);
    doc.moveDown(0.8);

    const badge = view.checklist.complet ? "COMPLET" : "INCOMPLET";
    const badgeColor = view.checklist.complet ? "#15803d" : "#b45309";
    doc.fillColor(badgeColor).fontSize(11).text(`État du dossier : ${badge}`, { underline: true });
    doc.moveDown(0.8);

    if (!view.checklist.entries.length) {
      doc.fillColor("#64748b").fontSize(10).text("Aucun document obligatoire configuré pour ce produit.");
    } else {
      doc.fillColor("#0f172a").fontSize(10);
      for (const entry of view.checklist.entries) {
        const oblig = entry.obligatoire ? " (obligatoire)" : "";
        const statut = DOSSIER_CHECKLIST_STATUT_LABELS[entry.statut];
        doc.text(`• ${entry.libelle}${oblig} — ${statut}`);
      }
    }

    doc.end();
  });
}
