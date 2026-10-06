import QRCode from "qrcode";

import type { ModuleCourrierRenderView } from "@/lib/lonaci/module-courrier-types";
import {
  collectPdfBuffer,
  contentBottom,
  contentWidth,
  createPremiumPdfDocument,
  finalizePremiumPages,
  type PdfDocument,
} from "@/lib/pdf/document";
import { drawWatermark } from "@/lib/pdf/primitives";
import { PDF_COLORS, PDF_SPACING } from "@/lib/pdf/tokens";

const PREMIUM = {
  navy: "#0B1220",
  navySoft: "#1E293B",
  ink: "#0F172A",
  inkSoft: "#334155",
  muted: "#64748B",
  mutedLight: "#94A3B8",
  gold: "#C9A227",
  goldSoft: "#FEF9E7",
  accent: PDF_COLORS.orange,
  accentDark: PDF_COLORS.orangeDark,
  accentSoft: "#FFF7ED",
  border: "#E2E8F0",
  shadow: "#CBD5E1",
  card: "#F8FAFC",
  cardStroke: "#E2E8F0",
  white: "#FFFFFF",
} as const;

const BODY_FONT_DEFAULT = 9.5;
const BODY_FONT_MIN = 8.25;
const BODY_LINE_GAP = 1.5;
const CLOSING_BAND_HEIGHT = 72;
const LEGAL_BLOCK_HEIGHT = 20;
const FOOTER_RESERVED =
  CLOSING_BAND_HEIGHT + LEGAL_BLOCK_HEIGHT + PDF_SPACING.sm + PDF_SPACING.md;

function authenticityToken(reference: string, issuedAt: Date): string {
  const compact = reference.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const stamp = issuedAt.toISOString().slice(0, 10).replace(/-/g, "");
  return `${compact.slice(-6).padStart(6, "0")}-${stamp}`;
}

function drawCardShadow(doc: PdfDocument, x: number, y: number, width: number, height: number, radius = 6): void {
  doc.save();
  doc.roundedRect(x + 1.5, y + 1.5, width, height, radius).fill(PREMIUM.shadow);
  doc.restore();
}

function drawAccentBar(doc: PdfDocument, x: number, y: number, height: number): void {
  doc.save();
  doc.roundedRect(x, y, 3, height, 1.5).fill(PREMIUM.accent);
  doc.roundedRect(x, y + 1, 1, height - 2, 0.5).fill(PREMIUM.gold);
  doc.restore();
}

function drawCompactTitle(doc: PdfDocument, view: ModuleCourrierRenderView): void {
  const x = doc.page.margins.left;
  const width = contentWidth(doc);
  const height = 24;
  const y = doc.y;

  doc.save();
  doc.rect(x, y, width, 2).fill(PREMIUM.accent);
  doc.rect(x, y + 2, width * 0.22, 1).fill(PREMIUM.gold);
  doc.restore();

  const issuedLabel = view.generatedAt.toLocaleString("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  });

  const title = view.documentTitle?.trim() || "Courrier officiel";
  doc
    .fillColor(PREMIUM.navy)
    .font("Helvetica-Bold")
    .fontSize(title.length > 28 ? 11 : 13)
    .text(title, x, y + 6, { width: width * 0.55, lineBreak: false });
  doc
    .fillColor(PREMIUM.muted)
    .font("Helvetica")
    .fontSize(7)
    .text(`Réf. ${view.reference}`, x + width * 0.55, y + 5, {
      width: width * 0.45,
      align: "right",
      lineBreak: false,
    });
  doc
    .fillColor(PREMIUM.mutedLight)
    .font("Helvetica")
    .fontSize(6.5)
    .text(`Édité le ${issuedLabel}`, x + width * 0.55, y + 14, {
      width: width * 0.45,
      align: "right",
      lineBreak: false,
    });

  doc.x = x;
  doc.y = y + height + PDF_SPACING.sm;
}

function measureExpediteurBlockHeight(doc: PdfDocument, cardWidth: number): number {
  const padding = PDF_SPACING.md;
  void cardWidth;
  const lineHeight = 11;
  const headerHeight = 12;
  const rows = 4;
  return padding * 2 + headerHeight + rows * lineHeight + PDF_SPACING.xs;
}

function drawExpediteurAndDate(doc: PdfDocument, view: ModuleCourrierRenderView): void {
  const x = doc.page.margins.left;
  const totalWidth = contentWidth(doc);
  const cardWidth = totalWidth * 0.64;
  const dateWidth = totalWidth - cardWidth - PDF_SPACING.md;
  const cardHeight = measureExpediteurBlockHeight(doc, cardWidth);
  const dateCardHeight = cardHeight;
  const y = doc.y;

  drawCardShadow(doc, x, y, cardWidth, cardHeight);
  doc.save();
  doc.roundedRect(x, y, cardWidth, cardHeight, 6).fillAndStroke(PREMIUM.card, PREMIUM.cardStroke);
  drawAccentBar(doc, x + 8, y + 8, cardHeight - 16);
  doc.restore();

  const innerX = x + 16;
  const innerWidth = cardWidth - 24;
  let rowY = y + PDF_SPACING.md;

  doc
    .fillColor(PREMIUM.navySoft)
    .font("Helvetica-Bold")
    .fontSize(6.5)
    .text(view.expediteurLabel?.trim() || "EXPÉDITEUR", innerX, rowY, {
      width: innerWidth,
      characterSpacing: 0.6,
    });
  rowY += 11;

  const rows = [
    { label: "Nom", value: view.expediteur.nom },
    { label: "Prénoms", value: view.expediteur.prenoms },
    { label: "Contacts", value: view.expediteur.contacts },
    { label: "Terminal", value: view.expediteur.codeTerminal },
  ];

  for (const row of rows) {
    doc
      .fillColor(PREMIUM.mutedLight)
      .font("Helvetica")
      .fontSize(6.5)
      .text(`${row.label} · `, innerX, rowY, { continued: true, lineBreak: false });
    doc
      .fillColor(PREMIUM.ink)
      .font("Helvetica-Bold")
      .fontSize(8.5)
      .text(row.value || "—", { width: innerWidth - 40, lineBreak: false });
    rowY += 11;
  }

  const dateX = x + cardWidth + PDF_SPACING.md;
  const datePad = 10;
  const dateTextX = dateX + datePad;
  const dateTextWidth = dateWidth - datePad * 2;

  drawCardShadow(doc, dateX, y, dateWidth, dateCardHeight);
  doc.save();
  doc.roundedRect(dateX, y, dateWidth, dateCardHeight, 6).fillAndStroke(PREMIUM.goldSoft, PREMIUM.gold);
  doc
    .roundedRect(dateX + 5, y + 5, dateWidth - 10, dateCardHeight - 10, 4)
    .lineWidth(0.4)
    .strokeColor(PREMIUM.gold)
    .stroke();
  doc.restore();

  const dateLong = view.generatedAt.toLocaleDateString("fr-FR", { dateStyle: "long" });

  doc
    .fillColor(PREMIUM.navySoft)
    .font("Helvetica-Bold")
    .fontSize(6.5)
    .text("LIEU & DATE", dateTextX, y + 12, { width: dateTextWidth });
  doc
    .fillColor(PREMIUM.ink)
    .font("Helvetica-Bold")
    .fontSize(8.5)
    .text("Abidjan", dateTextX, y + 24, { width: dateTextWidth });
  doc
    .fillColor(PREMIUM.inkSoft)
    .font("Helvetica")
    .fontSize(8)
    .text(`le ${dateLong}`, dateTextX, y + 36, { width: dateTextWidth });
  doc
    .fillColor(PREMIUM.muted)
    .font("Helvetica")
    .fontSize(6)
    .text("République de Côte d'Ivoire", dateTextX, y + 50, { width: dateTextWidth });

  doc.x = x;
  doc.y = y + cardHeight + PDF_SPACING.sm;
}

function drawDestinataireSection(doc: PdfDocument, destinataire: string): void {
  const x = doc.page.margins.left;
  const width = contentWidth(doc);
  const padding = PDF_SPACING.md;
  const labelHeight = 10;

  doc.font("Helvetica").fontSize(8.5);
  const bodyHeight = doc.heightOfString(destinataire, { width: width - padding * 2 - 14 });
  const cardHeight = padding * 2 + labelHeight + bodyHeight;

  const y = doc.y;
  drawCardShadow(doc, x, y, width, cardHeight);
  doc.save();
  doc.roundedRect(x, y, width, cardHeight, 6).fillAndStroke(PREMIUM.white, PREMIUM.cardStroke);
  drawAccentBar(doc, x + 8, y + 8, cardHeight - 16);
  doc.restore();

  doc
    .fillColor(PREMIUM.muted)
    .font("Helvetica-Bold")
    .fontSize(6.5)
    .text("DESTINATAIRE", x + 16, y + padding, { width: width - 32, characterSpacing: 0.6 });
  doc
    .fillColor(PREMIUM.navySoft)
    .font("Helvetica-Bold")
    .fontSize(8.5)
    .text(destinataire, x + 16, y + padding + labelHeight, { width: width - 32, lineGap: 1 });

  doc.x = x;
  doc.y = y + cardHeight + PDF_SPACING.sm;
}

function drawObjetHighlight(doc: PdfDocument, objet: string): void {
  const x = doc.page.margins.left;
  const width = contentWidth(doc);
  const paddingX = PDF_SPACING.md;
  const paddingY = PDF_SPACING.sm + 2;

  doc.font("Helvetica-Bold").fontSize(8.5);
  const textHeight = doc.heightOfString(objet, { width: width - paddingX * 2 - 16 });
  const bandHeight = paddingY * 2 + textHeight + 10;
  const y = doc.y;

  doc.save();
  doc.roundedRect(x, y, width, bandHeight, 4).fill(PREMIUM.accentSoft);
  doc.rect(x, y, 4, bandHeight).fill(PREMIUM.accent);
  doc.rect(x + 4, y, 1.5, bandHeight).fill(PREMIUM.gold);
  doc.restore();

  doc
    .fillColor(PREMIUM.accentDark)
    .font("Helvetica-Bold")
    .fontSize(6.5)
    .text("OBJET", x + paddingX + 6, y + paddingY, { characterSpacing: 0.6 });
  doc
    .fillColor(PREMIUM.ink)
    .font("Helvetica-Bold")
    .fontSize(8.5)
    .text(objet, x + paddingX + 6, y + paddingY + 9, { width: width - paddingX * 2 - 12 });

  doc.x = x;
  doc.y = y + bandHeight + PDF_SPACING.sm;
}

function measureBodyHeight(
  doc: PdfDocument,
  text: string,
  width: number,
  fontSize: number,
  lineGap: number,
): number {
  const blocks = text.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  let height = 0;

  for (const block of blocks) {
    const lines = block.split("\n");
    for (const line of lines) {
      if (!line.trim()) continue;
      const isSalutation = /^madame|monsieur|cher|chère/i.test(line.trim());
      doc.font(isSalutation ? "Helvetica-Bold" : "Helvetica").fontSize(fontSize);
      height += doc.heightOfString(line, { width, align: "justify", lineGap }) + PDF_SPACING.xs;
    }
    height += PDF_SPACING.sm;
  }

  return height;
}

function resolveBodyFontSize(doc: PdfDocument, text: string, maxHeight: number): number {
  const width = contentWidth(doc);
  let fontSize = BODY_FONT_DEFAULT;

  while (fontSize > BODY_FONT_MIN && measureBodyHeight(doc, text, width, fontSize, BODY_LINE_GAP) > maxHeight) {
    fontSize -= 0.25;
  }

  return fontSize;
}

function drawBodyWithin(doc: PdfDocument, text: string, maxY: number): void {
  const x = doc.page.margins.left;
  const width = contentWidth(doc);
  const maxHeight = Math.max(40, maxY - doc.y);
  const fontSize = resolveBodyFontSize(doc, text, maxHeight);
  const blocks = text.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);

  for (const block of blocks) {
    const lines = block.split("\n");
    for (const line of lines) {
      if (!line.trim()) continue;

      const isSalutation = /^madame|monsieur|cher|chère/i.test(line.trim());
      doc.font(isSalutation ? "Helvetica-Bold" : "Helvetica").fontSize(fontSize);
      const lineHeight = doc.heightOfString(line, { width, align: "justify", lineGap: BODY_LINE_GAP });
      if (doc.y + lineHeight > maxY) {
        doc.addPage();
        doc.y = doc.page.margins.top;
      }

      doc.fillColor(isSalutation ? PREMIUM.navySoft : PREMIUM.inkSoft).text(line, x, doc.y, {
        width,
        align: "justify",
        lineGap: BODY_LINE_GAP,
      });
      doc.y += PDF_SPACING.xs;
    }
    doc.y += PDF_SPACING.sm;
  }
}

function drawClosingBand(
  doc: PdfDocument,
  view: ModuleCourrierRenderView,
  qrPng: Buffer,
  y: number,
): void {
  const x = doc.page.margins.left;
  const width = contentWidth(doc);
  const gap = PDF_SPACING.md;
  const qrWidth = width * 0.58;
  const sigWidth = width - qrWidth - gap;
  const bandHeight = CLOSING_BAND_HEIGHT;
  const qrSize = 48;
  const padding = PDF_SPACING.sm + 2;

  drawCardShadow(doc, x, y, qrWidth, bandHeight);
  doc.save();
  doc.roundedRect(x, y, qrWidth, bandHeight, 6).fillAndStroke(PREMIUM.white, PREMIUM.cardStroke);
  doc.restore();

  doc.image(qrPng, x + padding, y + padding, { width: qrSize, height: qrSize, fit: [qrSize, qrSize] });
  const textX = x + padding + qrSize + PDF_SPACING.sm;
  const textWidth = qrWidth - padding * 2 - qrSize - PDF_SPACING.sm;
  const token = authenticityToken(view.reference, view.generatedAt);

  doc
    .fillColor(PREMIUM.ink)
    .font("Helvetica-Bold")
    .fontSize(7.5)
    .text("Authenticité", textX, y + padding + 2, { width: textWidth });
  doc
    .fillColor(PREMIUM.muted)
    .font("Helvetica")
    .fontSize(6.2)
    .text(`Réf. ${view.reference} · AUTH. ${token}`, textX, y + padding + 14, {
      width: textWidth,
      lineGap: 0.5,
    });

  const sigX = x + qrWidth + gap;
  drawCardShadow(doc, sigX, y, sigWidth, bandHeight, 6);
  doc.save();
  doc.roundedRect(sigX, y, sigWidth, bandHeight, 6).fillAndStroke(PREMIUM.white, PREMIUM.cardStroke);
  doc
    .moveTo(sigX + 12, y + 8)
    .lineTo(sigX + sigWidth - 12, y + 8)
    .lineWidth(0.4)
    .strokeColor(PREMIUM.gold)
    .stroke();
  doc.restore();

  doc
    .fillColor(PREMIUM.muted)
    .font("Helvetica-Bold")
    .fontSize(6.5)
    .text(view.signatureLabel.toUpperCase(), sigX + 12, y + 14, {
      width: sigWidth - 24,
      align: "center",
      characterSpacing: 0.4,
    });

  const lineY = y + 46;
  doc
    .moveTo(sigX + 14, lineY)
    .lineTo(sigX + sigWidth - 14, lineY)
    .lineWidth(0.7)
    .strokeColor(PREMIUM.border)
    .stroke();

  doc
    .fillColor(PREMIUM.ink)
    .font("Helvetica-Bold")
    .fontSize(8.5)
    .text(view.signatureName, sigX + 12, lineY + 8, { width: sigWidth - 24, align: "center" });
  doc
    .fillColor(PREMIUM.mutedLight)
    .font("Helvetica")
    .fontSize(6)
    .text("Signature · cachet si requis", sigX + 12, lineY + 22, {
      width: sigWidth - 24,
      align: "center",
    });
}

function drawLegalMention(doc: PdfDocument, view: ModuleCourrierRenderView, y: number): void {
  const x = doc.page.margins.left;
  const width = contentWidth(doc);
  const token = authenticityToken(view.reference, view.generatedAt);

  doc.save();
  doc.moveTo(x, y).lineTo(x + width, y).lineWidth(0.4).strokeColor(PREMIUM.gold).stroke();
  doc.restore();

  doc
    .fillColor(PREMIUM.mutedLight)
    .font("Helvetica")
    .fontSize(6)
    .text(
      `Document électronique LONACI · Réf. ${view.reference} · Jeton ${token} · Données figées à l'édition.`,
      x,
      y + PDF_SPACING.xs,
      { width, align: "center", lineBreak: false },
    );
}

function drawCornerFrames(doc: PdfDocument): void {
  const { left, top, right, bottom } = doc.page.margins;
  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const len = 18;
  doc.save();
  doc.lineWidth(0.6).strokeColor(PREMIUM.gold);
  doc.moveTo(left - 8, top - 18).lineTo(left - 8 + len, top - 18).stroke();
  doc.moveTo(left - 8, top - 18).lineTo(left - 8, top - 18 + len).stroke();
  doc
    .moveTo(pageWidth - right + 8, pageHeight - bottom + 8)
    .lineTo(pageWidth - right + 8 - len, pageHeight - bottom + 8)
    .stroke();
  doc
    .moveTo(pageWidth - right + 8, pageHeight - bottom + 8)
    .lineTo(pageWidth - right + 8, pageHeight - bottom + 8 - len)
    .stroke();
  doc.restore();
}

function applyPageEmbellishments(doc: PdfDocument): void {
  const range = doc.bufferedPageRange();
  for (let offset = 0; offset < range.count; offset += 1) {
    doc.switchToPage(range.start + offset);
    const cursor = { x: doc.x, y: doc.y };
    drawWatermark(doc, "LONACI", { opacity: 0.035, angle: -24, color: PREMIUM.navy });
    drawCornerFrames(doc);
    doc.x = cursor.x;
    doc.y = cursor.y;
  }
  if (range.count > 0) {
    doc.switchToPage(range.start + range.count - 1);
  }
}

async function buildCourrierQr(view: ModuleCourrierRenderView): Promise<Buffer> {
  const kind = view.documentKind?.trim() || "LONACI_COURRIER";
  const payload = JSON.stringify({
    type: kind,
    reference: view.reference,
    token: authenticityToken(view.reference, view.generatedAt),
    issuedAt: view.generatedAt.toISOString(),
  });
  return QRCode.toBuffer(payload, {
    type: "png",
    width: 200,
    margin: 1,
    errorCorrectionLevel: "M",
  });
}

export async function renderModuleCourrierPdf(view: ModuleCourrierRenderView): Promise<Buffer> {
  const qrPng = await buildCourrierQr(view);
  const kindLabel = view.documentKind?.trim() || "courrier";
  const pageLabel = view.documentLabel?.trim() || "COURRIER OFFICIEL";
  const doc = createPremiumPdfDocument({
    metadata: {
      title: `${view.documentTitle?.trim() || "Courrier"} — ${view.reference}`,
      subject: view.objet,
      creationDate: view.generatedAt,
      keywords: ["LONACI", kindLabel, view.reference, authenticityToken(view.reference, view.generatedAt)],
    },
    margins: {
      top: 80,
      bottom: 54,
    },
  });

  return collectPdfBuffer(doc, () => {
    const footerY = contentBottom(doc) - FOOTER_RESERVED;
    const bodyMaxY = footerY - PDF_SPACING.sm;

    drawCompactTitle(doc, view);
    drawExpediteurAndDate(doc, view);
    drawDestinataireSection(doc, view.destinataire);
    drawObjetHighlight(doc, view.objet);
    drawBodyWithin(doc, view.corps, bodyMaxY);

    drawClosingBand(doc, view, qrPng, footerY);
    drawLegalMention(doc, view, footerY + CLOSING_BAND_HEIGHT + PDF_SPACING.xs);

    finalizePremiumPages(doc, {
      reference: view.reference,
      issuedAt: view.generatedAt,
      documentLabel: pageLabel,
      organizationSubtitle: "Loterie Nationale de Côte d'Ivoire",
    });
    applyPageEmbellishments(doc);
  });
}

/** Compte les pages d'un buffer PDF (usage tests). */
export function countPdfPages(buffer: Buffer): number {
  const source = buffer.toString("latin1");
  const matches = source.match(/\/Type\s*\/Page\b(?!s)/g);
  return matches?.length ?? 0;
}
