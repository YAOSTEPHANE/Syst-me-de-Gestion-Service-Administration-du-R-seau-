import { contentWidth, type PdfDocument } from "@/lib/pdf/document";
import type { PdfField, PdfSignature } from "@/lib/pdf/primitives";
import { PDF_COLORS, PDF_PREMIUM, PDF_SPACING, PDF_TYPOGRAPHY } from "@/lib/pdf/tokens";

/** Mise en page compacte des documents qui doivent tenir sur une seule feuille A4. */
export const COMPACT_LABEL_SIZE = 6.5;
export const COMPACT_VALUE_SIZE = 7.5;
export const COMPACT_TITLE_SIZE = 8.5;
export const COMPACT_TITLE_HEIGHT = COMPACT_TITLE_SIZE + 4;
export const COMPACT_LINE_HEIGHT = 11;
export const COMPACT_SIGNATURE_BOX_HEIGHT = 78;
const COMPACT_GRID_PADDING = 6;
const COMPACT_COLUMN_GAP = 14;
const SINGLE_SIGNATURE_BOX_WIDTH = 240;

export const CHEF_SERVICE_PDF_SIGNATURE: PdfSignature = {
  label: "Le Chef de Service LONACI",
  dateLabel: "Date :",
  footerLabel: "Signature et cachet",
};

export function drawCompactHeader(doc: PdfDocument, title: string, subtitle: string) {
  const left = doc.page.margins.left;
  const width = contentWidth(doc);
  doc
    .fillColor(PDF_PREMIUM.ink)
    .font("Helvetica-Bold")
    .fontSize(15)
    .text(title, left, doc.y, { width, lineBreak: false });
  doc
    .fillColor(PDF_COLORS.muted)
    .font("Helvetica")
    .fontSize(PDF_TYPOGRAPHY.small)
    .text(subtitle, left, doc.y, { width });
  doc.moveDown(0.35);
}

export function drawCompactBlockTitle(doc: PdfDocument, title: string) {
  doc
    .fillColor(PDF_PREMIUM.accentDark)
    .font("Helvetica-Bold")
    .fontSize(COMPACT_TITLE_SIZE)
    .text(title.toUpperCase(), doc.page.margins.left, doc.y, {
      width: contentWidth(doc),
      lineBreak: false,
      characterSpacing: 0.4,
    });
  doc.y += 2;
}

export function drawCompactFieldGrid(doc: PdfDocument, title: string, fields: PdfField[], columns = 2) {
  drawCompactBlockTitle(doc, title);
  const left = doc.page.margins.left;
  const width = contentWidth(doc);
  const innerWidth = width - COMPACT_GRID_PADDING * 2;
  const columnWidth = (innerWidth - COMPACT_COLUMN_GAP * (columns - 1)) / columns;
  const labelWidth = Math.min(96, columnWidth * 0.42);
  const valueWidth = columnWidth - labelWidth - 4;

  const rows: PdfField[][] = [];
  for (let index = 0; index < fields.length; index += columns) {
    rows.push(fields.slice(index, index + columns));
  }
  const rowHeights = rows.map(
    (row) =>
      Math.max(
        ...row.map((field) => {
          doc.font("Helvetica").fontSize(COMPACT_LABEL_SIZE);
          const labelHeight = doc.heightOfString(field.label, { width: labelWidth });
          doc.font("Helvetica-Bold").fontSize(COMPACT_VALUE_SIZE);
          const valueHeight = doc.heightOfString(field.value || "—", { width: valueWidth });
          return Math.max(labelHeight, valueHeight);
        }),
      ) + 3,
  );
  const top = doc.y;
  const height = rowHeights.reduce((sum, rowHeight) => sum + rowHeight, 0) + COMPACT_GRID_PADDING * 2 - 3;
  doc.save().roundedRect(left, top, width, height, 5).fillAndStroke(PDF_PREMIUM.card, PDF_PREMIUM.cardStroke).restore();

  let y = top + COMPACT_GRID_PADDING;
  rows.forEach((row, rowIndex) => {
    row.forEach((field, columnIndex) => {
      const x = left + COMPACT_GRID_PADDING + columnIndex * (columnWidth + COMPACT_COLUMN_GAP);
      doc
        .fillColor(PDF_PREMIUM.muted)
        .font("Helvetica")
        .fontSize(COMPACT_LABEL_SIZE)
        .text(field.label, x, y + 0.8, { width: labelWidth });
      doc
        .fillColor(PDF_PREMIUM.ink)
        .font("Helvetica-Bold")
        .fontSize(COMPACT_VALUE_SIZE)
        .text(field.value || "—", x + labelWidth + 4, y, { width: valueWidth });
    });
    y += rowHeights[rowIndex] ?? 0;
  });
  doc.x = left;
  doc.y = top + height + PDF_SPACING.sm;
}

/**
 * Joint les éléments avec `separator` ; au-delà de `maxHeight`, la fin est résumée (« … et N autre(s) »).
 * La police courante du document sert à la mesure.
 */
export function fitCompactList(
  doc: PdfDocument,
  items: string[],
  options: { separator: string; width: number; maxHeight: number; emptySummary: string },
): string {
  const { separator, width, maxHeight } = options;
  const full = items.join(separator);
  if (doc.heightOfString(full, { width }) <= maxHeight) return full;
  const summary = (shown: number) =>
    shown === 0
      ? options.emptySummary
      : `${items.slice(0, shown).join(separator)}${separator}… et ${items.length - shown} autre(s)`;
  let low = 1;
  let high = items.length - 1;
  let best = summary(0);
  while (low <= high) {
    const shown = Math.floor((low + high) / 2);
    const candidate = summary(shown);
    if (doc.heightOfString(candidate, { width }) <= maxHeight) {
      best = candidate;
      low = shown + 1;
    } else {
      high = shown - 1;
    }
  }
  return best;
}

/** Cadres de signature côte à côte ; un cadre unique est aligné à droite. */
export function drawCompactSignatureBoxes(doc: PdfDocument, signatures: PdfSignature[]) {
  const left = doc.page.margins.left;
  const width = contentWidth(doc);
  const gap = 18;
  const boxWidth =
    signatures.length === 1
      ? SINGLE_SIGNATURE_BOX_WIDTH
      : (width - gap * (signatures.length - 1)) / signatures.length;
  const firstX = signatures.length === 1 ? left + width - boxWidth : left;
  const top = doc.y;
  const height = COMPACT_SIGNATURE_BOX_HEIGHT;
  signatures.forEach((signature, index) => {
    const x = firstX + index * (boxWidth + gap);
    doc.save().roundedRect(x, top, boxWidth, height, 5).fillAndStroke(PDF_PREMIUM.white, PDF_PREMIUM.cardStroke).restore();
    doc
      .fillColor(PDF_PREMIUM.ink)
      .font("Helvetica-Bold")
      .fontSize(COMPACT_TITLE_SIZE)
      .text(signature.label, x + 8, top + 6, { width: boxWidth - 16, lineBreak: false });
    doc
      .fillColor(PDF_PREMIUM.muted)
      .font("Helvetica")
      .fontSize(COMPACT_LABEL_SIZE)
      .text(signature.dateLabel ?? "Date :", x + 8, top + 19, { width: boxWidth - 16, lineBreak: false });
    doc
      .moveTo(x + 8, top + height - 16)
      .lineTo(x + boxWidth - 8, top + height - 16)
      .lineWidth(0.6)
      .strokeColor(PDF_PREMIUM.mutedLight)
      .stroke();
    doc
      .fillColor(PDF_PREMIUM.muted)
      .font("Helvetica")
      .fontSize(COMPACT_LABEL_SIZE)
      .text(signature.footerLabel ?? "Signature", x + 8, top + height - 12, {
        width: boxWidth - 16,
        align: "center",
        lineBreak: false,
      });
  });
  doc.x = left;
  doc.y = top + height + PDF_SPACING.xs;
}

export function drawCompactFootnote(doc: PdfDocument, text: string) {
  doc
    .fillColor(PDF_COLORS.muted)
    .font("Helvetica")
    .fontSize(COMPACT_LABEL_SIZE)
    .text(text, doc.page.margins.left, doc.y, { width: contentWidth(doc), lineBreak: false });
}
