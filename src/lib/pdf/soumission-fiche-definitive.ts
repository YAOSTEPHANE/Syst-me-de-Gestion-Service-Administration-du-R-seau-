import QRCode from "qrcode";

import {
  collectPdfBuffer,
  contentWidth,
  createPremiumPdfDocument,
  finalizePremiumPages,
} from "@/lib/pdf/document";
import { drawInformationCard, drawStatusBadge } from "@/lib/pdf/primitives";
import {
  drawAmountAndQr,
  drawCompactSignatures,
  FICHE_MARGINS,
} from "@/lib/pdf/soumission-fiche-paiement";
import { PDF_COLORS, PDF_PREMIUM, PDF_TYPOGRAPHY } from "@/lib/pdf/tokens";

export const SOUMISSION_FICHE_DEFINITIVE_TITLE = "Fiche définitive de paiement";

export type SoumissionFicheDefinitiveView = {
  soumissionId: string;
  numeroFicheDefinitive: string;
  referenceFicheCaisse: string;
  emiseLe: string;
  nomComplet: string;
  contact: string;
  typeDistributeurLabel: string;
  nombreTpe: number;
  produitCode: string;
  agenceLabel: string;
  montantFCFA: number;
  modeLibelle: string;
  paymentReference: string;
  validePar: string;
  ficheCaisseEmisePar: string | null;
};

export function buildSoumissionFicheVerificationPayload(
  view: Pick<SoumissionFicheDefinitiveView, "soumissionId" | "numeroFicheDefinitive" | "paymentReference">,
): string {
  return ["LONACI", "SOUMISSION", view.soumissionId, view.numeroFicheDefinitive, view.paymentReference].join("|");
}

/** Fiche définitive (FDS) d'une soumission payée — une seule page A4. */
export async function renderSoumissionFicheDefinitivePdf(
  view: SoumissionFicheDefinitiveView,
): Promise<Buffer> {
  const issuedAt = new Date(view.emiseLe);
  const qrImage = await QRCode.toBuffer(buildSoumissionFicheVerificationPayload(view), {
    type: "png",
    margin: 1,
    width: 120,
    errorCorrectionLevel: "M",
  });

  const doc = createPremiumPdfDocument({
    margins: FICHE_MARGINS,
    metadata: {
      title: SOUMISSION_FICHE_DEFINITIVE_TITLE,
      subject: `Soumission payée ${view.numeroFicheDefinitive}`,
      author: view.validePar,
      keywords: ["LONACI", "soumission", "paiement", "fiche définitive", view.numeroFicheDefinitive],
      creationDate: issuedAt,
    },
  });

  return collectPdfBuffer(doc, () => {
    const width = contentWidth(doc);
    doc.x = doc.page.margins.left;
    doc
      .fillColor(PDF_PREMIUM.ink)
      .font("Helvetica-Bold")
      .fontSize(15)
      .text(SOUMISSION_FICHE_DEFINITIVE_TITLE, { width, lineBreak: false });
    doc
      .fillColor(PDF_COLORS.muted)
      .font("Helvetica")
      .fontSize(PDF_TYPOGRAPHY.small)
      .text(
        `Réf. ${view.numeroFicheDefinitive} · Fiche caisse ${view.referenceFicheCaisse} · ${issuedAt.toLocaleString(
          "fr-FR",
          { dateStyle: "short", timeStyle: "short" },
        )}`,
        { width },
      );
    doc.moveDown(0.35);

    drawStatusBadge(doc, "PAYÉE", "success");
    drawAmountAndQr(doc, view.montantFCFA, view.numeroFicheDefinitive, qrImage, {
      label: "MONTANT RÉGLÉ",
      caption: `QR vérification · ${view.numeroFicheDefinitive}`,
    });

    drawInformationCard(
      doc,
      [
        { label: "Nom complet", value: view.nomComplet },
        { label: "Contact", value: view.contact },
        { label: "Type distributeur", value: view.typeDistributeurLabel },
        { label: "TPE", value: String(view.nombreTpe) },
        { label: "Produit", value: view.produitCode || "—" },
        { label: "Zone", value: view.agenceLabel },
      ],
      "Identité du contact",
    );

    drawInformationCard(
      doc,
      [
        { label: "Mode de paiement", value: view.modeLibelle },
        { label: "Référence de paiement", value: view.paymentReference },
        { label: "Date de validation", value: issuedAt.toLocaleDateString("fr-FR", { dateStyle: "long" }) },
        { label: "Validé par", value: view.validePar },
        { label: "Fiche caisse émise par", value: view.ficheCaisseEmisePar ?? "—" },
      ],
      "Règlement",
    );

    drawCompactSignatures(doc, [
      { title: "Visa responsable administratif", detail: "Nom et date", footer: "Signature et cachet" },
      { title: "Visa chef de service", detail: view.validePar, footer: "Signature et cachet" },
    ]);

    doc
      .fillColor(PDF_COLORS.muted)
      .font("Helvetica")
      .fontSize(6.5)
      .text(
        "Ce document atteste le règlement de la soumission. La référence de paiement est unique et obligatoire pour tout rapprochement comptable.",
        { align: "justify", width },
      );

    finalizePremiumPages(doc, {
      reference: view.numeroFicheDefinitive,
      issuedAt,
      documentLabel: "SOUMISSION · FICHE DÉFINITIVE",
      generatedBy: view.validePar,
    });
  });
}
