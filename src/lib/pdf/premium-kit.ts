import type { PdfDocument, PremiumPageChrome } from "./document";
import { contentWidth, finalizePremiumPages } from "./document";
import { drawWatermark, ensureSpace } from "./primitives";
import { PDF_PREMIUM, PDF_SPACING } from "./tokens";

export { PDF_PREMIUM };

export function premiumAuthenticityToken(reference: string, issuedAt: Date): string {
  const compact = reference.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const stamp = issuedAt.toISOString().slice(0, 10).replace(/-/g, "");
  return `${compact.slice(-6).padStart(6, "0")}-${stamp}`;
}

export function drawPremiumCardShadow(
  doc: PdfDocument,
  x: number,
  y: number,
  width: number,
  height: number,
  radius = 8,
): void {
  doc.save();
  doc.roundedRect(x + 2.5, y + 2.5, width, height, radius).fill(PDF_PREMIUM.shadow);
  doc.restore();
}

export function drawPremiumAccentBar(doc: PdfDocument, x: number, y: number, height: number): void {
  doc.save();
  doc.roundedRect(x, y, 4, height, 2).fill(PDF_PREMIUM.accent);
  doc.roundedRect(x, y + 2, 1.5, height - 4, 1).fill(PDF_PREMIUM.gold);
  doc.restore();
}

export function drawPremiumLonaciSeal(doc: PdfDocument, centerX: number, centerY: number, radius: number): void {
  doc.save();
  doc.circle(centerX, centerY, radius).fill(PDF_PREMIUM.accent);
  doc.circle(centerX, centerY, radius - 3).lineWidth(1).strokeColor(PDF_PREMIUM.gold).stroke();
  doc.circle(centerX, centerY, radius - 7).lineWidth(0.5).strokeColor(PDF_PREMIUM.white).stroke();
  doc
    .fillColor(PDF_PREMIUM.white)
    .font("Helvetica-Bold")
    .fontSize(radius * 0.62)
    .text("L", centerX - radius * 0.22, centerY - radius * 0.34, { lineBreak: false });
  doc
    .font("Helvetica-Bold")
    .fontSize(5.5)
    .text("LONACI", centerX - radius + 4, centerY + radius * 0.18, {
      width: radius * 2 - 8,
      align: "center",
      characterSpacing: 0.9,
    });
  doc.restore();
}

export function drawPremiumMetaRibbon(
  doc: PdfDocument,
  options: {
    reference: string;
    centerLabel: string;
    issuedAt: Date;
  },
): void {
  const x = doc.page.margins.left;
  const width = contentWidth(doc);
  const height = 22;
  ensureSpace(doc, height + PDF_SPACING.md);
  const y = doc.y;

  doc.save();
  doc.roundedRect(x, y, width, height, 4).fill(PDF_PREMIUM.navy);
  doc.rect(x + 8, y, 3, height).fill(PDF_PREMIUM.gold);
  doc.restore();

  const token = premiumAuthenticityToken(options.reference, options.issuedAt);
  doc.fillColor(PDF_PREMIUM.white).font("Helvetica-Bold").fontSize(6.5);
  doc.text(`RÉF. ${options.reference}`, x + 16, y + 7, { width: width * 0.34, lineBreak: false });
  doc.text(options.centerLabel, x + width * 0.22, y + 7, {
    width: width * 0.56,
    align: "center",
    lineBreak: false,
    characterSpacing: 0.6,
  });
  doc.text(`AUTH. ${token}`, x + width * 0.66, y + 7, {
    width: width * 0.3,
    align: "right",
    lineBreak: false,
  });

  doc.x = x;
  doc.y = y + height + PDF_SPACING.lg;
}

export function drawPremiumDocumentHero(
  doc: PdfDocument,
  options: {
    title: string;
    subtitle?: string;
    reference?: string;
    issuedAt?: Date;
    compact?: boolean;
  },
): void {
  const x = doc.page.margins.left;
  const width = contentWidth(doc);
  const height = options.compact ? 64 : 88;
  ensureSpace(doc, height + PDF_SPACING.sm);
  const y = doc.y;

  drawPremiumCardShadow(doc, x, y, width, height, 10);
  doc.save();
  doc.roundedRect(x, y, width, height, 10).fill(PDF_PREMIUM.white);
  doc.rect(x, y, width, 4).fill(PDF_PREMIUM.accent);
  doc.rect(x, y + 4, width * 0.28, 1.5).fill(PDF_PREMIUM.gold);
  doc.restore();

  if (!options.compact) {
    drawPremiumLonaciSeal(doc, x + width - 44, y + height / 2, 24);
  }

  const textWidth = options.compact ? width - 36 : width - 100;
  doc
    .fillColor(PDF_PREMIUM.navy)
    .font("Helvetica-Bold")
    .fontSize(options.compact ? 16 : 20)
    .text(options.title, x + 18, y + (options.compact ? 14 : 18), { width: textWidth, lineBreak: false });
  if (options.subtitle) {
    doc
      .fillColor(PDF_PREMIUM.muted)
      .font("Helvetica")
      .fontSize(8.5)
      .text(options.subtitle, x + 18, y + (options.compact ? 34 : 44), { width: textWidth, lineBreak: false });
  }
  if (options.reference) {
    doc
      .fillColor(PDF_PREMIUM.accentDark)
      .font("Helvetica-Bold")
      .fontSize(7.5)
      .text(`Réf. ${options.reference}`, x + 18, y + height - 22, {
        width: textWidth,
        lineBreak: false,
        characterSpacing: 0.3,
      });
  }
  if (options.issuedAt) {
    doc
      .fillColor(PDF_PREMIUM.mutedLight)
      .font("Helvetica")
      .fontSize(7)
      .text(
        `Édité le ${options.issuedAt.toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" })}`,
        x + 18,
        y + height - 11,
        { width: textWidth, lineBreak: false },
      );
  }

  doc.x = x;
  doc.y = y + height + PDF_SPACING.lg;
}

/** Ouverture standard : ruban métadonnées + carte titre pour exports et fiches. */
export function drawPremiumDocumentOpening(
  doc: PdfDocument,
  options: {
    title: string;
    subtitle?: string;
    reference: string;
    issuedAt: Date;
    centerLabel: string;
    compact?: boolean;
  },
): void {
  drawPremiumMetaRibbon(doc, {
    reference: options.reference,
    centerLabel: options.centerLabel,
    issuedAt: options.issuedAt,
  });
  drawPremiumDocumentHero(doc, {
    title: options.title,
    subtitle: options.subtitle,
    reference: options.reference,
    issuedAt: options.issuedAt,
    compact: options.compact,
  });
}

function drawPremiumCornerFrames(doc: PdfDocument): void {
  const { left, top, right, bottom } = doc.page.margins;
  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const len = 22;
  doc.save();
  doc.lineWidth(0.7).strokeColor(PDF_PREMIUM.gold);
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

export function applyPremiumPageEmbellishments(doc: PdfDocument): void {
  const range = doc.bufferedPageRange();
  for (let offset = 0; offset < range.count; offset += 1) {
    doc.switchToPage(range.start + offset);
    const cursor = { x: doc.x, y: doc.y };
    drawWatermark(doc, "LONACI", { opacity: 0.04, angle: -24, color: PDF_PREMIUM.navy });
    drawPremiumCornerFrames(doc);
    doc.x = cursor.x;
    doc.y = cursor.y;
  }
  if (range.count > 0) {
    doc.switchToPage(range.start + range.count - 1);
  }
}

export function finalizePremiumDocument(doc: PdfDocument, chrome: PremiumPageChrome): void {
  finalizePremiumPages(doc, chrome);
  applyPremiumPageEmbellishments(doc);
}
