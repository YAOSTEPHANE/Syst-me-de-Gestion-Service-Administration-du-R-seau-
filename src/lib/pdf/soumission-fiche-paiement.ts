import QRCode from "qrcode";

import { montantFcfaEnLettres } from "@/lib/lonaci/montant-en-lettres";
import {
  formatSoumissionPaiementMontant,
  SOUMISSION_FICHE_PAIEMENT_TITLE,
  SOUMISSION_PAIEMENT_CAISSE_MONTANT_FCFA,
} from "@/lib/lonaci/soumission-paiement-constants";
import {
  collectPdfBuffer,
  contentWidth,
  createPremiumPdfDocument,
  finalizePremiumPages,
  type PdfDocument,
} from "@/lib/pdf/document";
import {
  drawInformationCard,
  drawStatusBadge,
  drawWatermark,
  ensureSpace,
} from "@/lib/pdf/primitives";
import { PDF_COLORS, PDF_PAGE, PDF_PREMIUM, PDF_SPACING, PDF_TYPOGRAPHY } from "@/lib/pdf/tokens";

export type SoumissionFichePaiementView = {
  reference: string;
  nomComplet: string;
  contact: string;
  typeDistributeurLabel: string;
  nombreTpe: number;
  agenceLabel: string;
  montantFCFA: number;
  agentNom: string;
  generatedAt: string;
  observations: string | null;
};

/** Mise en page compacte : les fiches soumission doivent tenir sur 1 feuille A4. */
export const FICHE_MARGINS = {
  /** Doit rester sous le bandeau orange de l'en-tête premium (y=24, hauteur 58). */
  top: PDF_PAGE.topMargin + 8,
  right: 40,
  bottom: 48,
  left: 40,
} as const;

function drawCompactHeader(doc: PdfDocument, reference: string, issuedAt: Date): void {
  const left = doc.page.margins.left;
  const width = contentWidth(doc);
  ensureSpace(doc, 36);
  doc.x = left;
  doc
    .fillColor(PDF_PREMIUM.ink)
    .font("Helvetica-Bold")
    .fontSize(15)
    .text(SOUMISSION_FICHE_PAIEMENT_TITLE, { width, lineBreak: false });
  doc
    .fillColor(PDF_COLORS.muted)
    .font("Helvetica")
    .fontSize(PDF_TYPOGRAPHY.small)
    .text(
      `Réf. ${reference} · ${issuedAt.toLocaleString("fr-FR", {
        dateStyle: "short",
        timeStyle: "short",
      })}`,
      { width },
    );
  doc.moveDown(0.35);
}

export function drawAmountAndQr(
  doc: PdfDocument,
  montant: number,
  reference: string,
  qrImage: Buffer,
  options: { label?: string; caption?: string } = {},
): void {
  const left = doc.page.margins.left;
  const width = contentWidth(doc);
  const qrSize = 56;
  const gap = PDF_SPACING.sm;
  const cardWidth = width - qrSize - gap - 8;
  const amount = formatSoumissionPaiementMontant(montant);
  const letters = montantFcfaEnLettres(montant);
  const height = 58;
  ensureSpace(doc, height + 6);
  const y = doc.y;

  doc.save();
  doc.roundedRect(left, y, cardWidth, height, 6).fill(PDF_PREMIUM.accentSoft);
  doc
    .roundedRect(left, y, cardWidth, height, 6)
    .lineWidth(1.1)
    .strokeColor(PDF_PREMIUM.accent)
    .stroke();
  doc.rect(left, y, 4, height).fill(PDF_PREMIUM.accent);
  doc
    .fillColor(PDF_PREMIUM.accentDark)
    .font("Helvetica-Bold")
    .fontSize(7)
    .text(options.label ?? "MONTANT À ENCAISSER", left + 10, y + 7, {
      width: cardWidth - 20,
      lineBreak: false,
    });
  doc
    .fillColor(PDF_PREMIUM.ink)
    .font("Helvetica-Bold")
    .fontSize(16)
    .text(amount, left + 10, y + 20, {
      width: cardWidth - 20,
      lineBreak: false,
    });
  doc
    .fillColor(PDF_PREMIUM.inkSoft)
    .font("Helvetica-Oblique")
    .fontSize(7)
    .text(letters, left + 10, y + 40, {
      width: cardWidth - 20,
      lineBreak: false,
    });

  const qrX = left + cardWidth + gap;
  doc.roundedRect(qrX, y, qrSize + 8, height, 6).strokeColor(PDF_COLORS.border).stroke();
  doc.image(qrImage, qrX + 4, y + (height - qrSize) / 2, {
    width: qrSize,
    height: qrSize,
    fit: [qrSize, qrSize],
  });
  doc.restore();

  doc.x = left;
  doc.y = y + height + 2;
  doc
    .fillColor(PDF_COLORS.muted)
    .font("Helvetica")
    .fontSize(6.5)
    .text(options.caption ?? `QR contrôle · ${reference}`, { width, align: "right", lineBreak: false });
  doc.moveDown(0.4);
}

function drawCashierInstructions(doc: PdfDocument, reference: string): void {
  const left = doc.page.margins.left;
  const width = contentWidth(doc);
  const body =
    `Vérifier identité + réf. ${reference} · Encaisser · Reporter N° reçu sur visa caisse · Tamponner.`;
  const height = 28;
  ensureSpace(doc, height + 4);
  const y = doc.y;
  doc.save();
  doc.roundedRect(left, y, width, height, 4).fill(PDF_COLORS.infoLight);
  doc.roundedRect(left, y, width, height, 4).lineWidth(0.6).strokeColor("#93C5FD").stroke();
  doc
    .fillColor(PDF_COLORS.info)
    .font("Helvetica-Bold")
    .fontSize(7)
    .text("CONSIGNES CAISSE", left + 8, y + 4, { width: width - 16, lineBreak: false });
  doc
    .fillColor(PDF_PREMIUM.ink)
    .font("Helvetica")
    .fontSize(7)
    .text(body, left + 8, y + 14, { width: width - 16, lineBreak: false });
  doc.restore();
  doc.x = left;
  doc.y = y + height + 8;
}

export type CompactSignatureBox = { title: string; detail: string; footer: string };

const FICHE_CAISSE_SIGNATURES: readonly CompactSignatureBox[] = [
  { title: "Visa responsable administratif", detail: "Nom et date", footer: "Signature et cachet" },
  { title: "Visa caisse", detail: "Caissier(ère)", footer: "N° reçu · Signature et cachet" },
];

export function drawCompactSignatures(
  doc: PdfDocument,
  boxes: readonly CompactSignatureBox[] = FICHE_CAISSE_SIGNATURES,
): void {
  const left = doc.page.margins.left;
  const gap = 16;
  const width = (contentWidth(doc) - gap) / 2;
  const height = 72;
  ensureSpace(doc, height);
  const y = doc.y;

  boxes.forEach((box, index) => {
    const x = left + index * (width + gap);
    doc.save();
    doc.roundedRect(x, y, width, height, 4).strokeColor(PDF_COLORS.border).stroke();
    doc
      .fillColor(PDF_PREMIUM.ink)
      .font("Helvetica-Bold")
      .fontSize(PDF_TYPOGRAPHY.label)
      .text(box.title, x + 8, y + 6, { width: width - 16, align: "center", lineBreak: false });
    doc
      .moveTo(x + 12, y + 42)
      .lineTo(x + width - 12, y + 42)
      .strokeColor(PDF_COLORS.border)
      .lineWidth(0.6)
      .stroke();
    doc
      .fillColor(PDF_COLORS.muted)
      .font("Helvetica")
      .fontSize(6.5)
      .text(box.detail, x + 8, y + 48, { width: width - 16, align: "center", lineBreak: false })
      .text(box.footer, x + 8, y + 58, { width: width - 16, align: "center", lineBreak: false });
    doc.restore();
  });

  doc.x = left;
  doc.y = y + height + 6;
}

function applyWatermarks(doc: PdfDocument): void {
  const range = doc.bufferedPageRange();
  for (let offset = 0; offset < range.count; offset += 1) {
    doc.switchToPage(range.start + offset);
    drawWatermark(doc, "À RÉGLER", { opacity: 0.06, angle: -32 });
  }
}

/**
 * Fiche de paiement caisse (soumission / phoning) — une seule page A4.
 */
export async function renderSoumissionFichePaiementPdf(
  view: SoumissionFichePaiementView,
): Promise<Buffer> {
  const issuedAt = new Date(view.generatedAt);
  const montant =
    view.montantFCFA > 0 ? view.montantFCFA : SOUMISSION_PAIEMENT_CAISSE_MONTANT_FCFA;

  const qrPayload = [
    "SOUMISSION_FICHE_CAISSE",
    view.reference,
    String(montant),
    view.generatedAt.slice(0, 10),
  ].join("|");
  const qrImage = await QRCode.toBuffer(qrPayload, {
    type: "png",
    margin: 1,
    width: 120,
    errorCorrectionLevel: "M",
  });

  const doc = createPremiumPdfDocument({
    margins: FICHE_MARGINS,
    metadata: {
      title: SOUMISSION_FICHE_PAIEMENT_TITLE,
      subject: `Paiement caisse ${formatSoumissionPaiementMontant(montant)}`,
      author: view.agentNom,
      keywords: ["LONACI", "soumission", "paiement", "caisse", "fiche"],
      creationDate: issuedAt,
    },
  });

  return collectPdfBuffer(doc, () => {
    drawCompactHeader(doc, view.reference, issuedAt);
    drawStatusBadge(doc, "À RÉGLER À LA CAISSE", "warning");
    drawAmountAndQr(doc, montant, view.reference, qrImage);

    doc
      .fillColor(PDF_PREMIUM.ink)
      .font("Helvetica-Bold")
      .fontSize(PDF_TYPOGRAPHY.section)
      .text("Identité du contact", { width: contentWidth(doc) });
    doc.moveDown(0.25);

    drawInformationCard(doc, [
      { label: "Nom complet", value: view.nomComplet },
      { label: "Contact", value: view.contact },
      { label: "Type distributeur", value: view.typeDistributeurLabel },
      { label: "TPE", value: String(view.nombreTpe) },
      { label: "Zone", value: view.agenceLabel },
      ...(view.observations?.trim()
        ? [{ label: "Observation", value: view.observations.trim() }]
        : []),
    ]);

    drawCashierInstructions(doc, view.reference);
    drawCompactSignatures(doc);

    doc
      .fillColor(PDF_COLORS.muted)
      .font("Helvetica")
      .fontSize(6.5)
      .text(
        "Document préparatoire : ne vaut pas quittance. Seul l’enregistrement caisse LONACI constitue la preuve de paiement.",
        { align: "justify", width: contentWidth(doc) },
      );

    applyWatermarks(doc);
    finalizePremiumPages(doc, {
      reference: view.reference,
      issuedAt,
      documentLabel: "SOUMISSION · FICHE PAIEMENT CAISSE",
      generatedBy: view.agentNom,
    });

    // Garde-fou : jamais plus d’une page pour ce document guichet.
    const pages = doc.bufferedPageRange().count;
    if (pages > 1) {
      throw new Error(`FICHE_CAISSE_MULTI_PAGE:${pages}`);
    }
  });
}
