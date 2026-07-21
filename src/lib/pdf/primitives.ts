import type { PdfDocument } from "./document";
import { contentBottom, contentWidth } from "./document";
import { PDF_COLORS, PDF_SPACING, PDF_TYPOGRAPHY } from "./tokens";

export type PdfStatusTone = "neutral" | "success" | "warning" | "danger" | "info";

export interface PdfField {
  label: string;
  value: string;
}

export interface PdfSignature {
  label: string;
  name?: string;
  role?: string;
  dateLabel?: string;
  footerLabel?: string;
}

export interface PdfQrBlockOptions {
  label: string;
  description?: string;
  image?: Buffer;
  size?: number;
}

const STATUS_COLORS: Record<PdfStatusTone, { foreground: string; background: string }> = {
  neutral: { foreground: PDF_COLORS.ink, background: PDF_COLORS.surfaceMuted },
  success: { foreground: PDF_COLORS.success, background: PDF_COLORS.successLight },
  warning: { foreground: PDF_COLORS.warning, background: PDF_COLORS.warningLight },
  danger: { foreground: PDF_COLORS.danger, background: PDF_COLORS.dangerLight },
  info: { foreground: PDF_COLORS.info, background: PDF_COLORS.infoLight },
};

export function ensureSpace(doc: PdfDocument, requiredHeight: number): boolean {
  if (requiredHeight < 0) {
    throw new RangeError("requiredHeight doit être positif.");
  }
  if (doc.y + requiredHeight <= contentBottom(doc)) {
    return false;
  }
  doc.addPage();
  return true;
}

export function drawTitle(doc: PdfDocument, title: string, subtitle?: string): void {
  const width = contentWidth(doc);
  const subtitleHeight = subtitle
    ? doc.font("Helvetica").fontSize(PDF_TYPOGRAPHY.body).heightOfString(subtitle, { width })
    : 0;
  ensureSpace(doc, 30 + subtitleHeight);
  doc
    .fillColor(PDF_COLORS.ink)
    .font("Helvetica-Bold")
    .fontSize(PDF_TYPOGRAPHY.title)
    .text(title, { width });
  if (subtitle) {
    doc
      .moveDown(0.25)
      .fillColor(PDF_COLORS.muted)
      .font("Helvetica")
      .fontSize(PDF_TYPOGRAPHY.body)
      .text(subtitle, { width });
  }
  doc.moveDown(0.7);
}

export function drawStatusBadge(
  doc: PdfDocument,
  label: string,
  tone: PdfStatusTone = "neutral",
): void {
  const colors = STATUS_COLORS[tone];
  doc.font("Helvetica-Bold").fontSize(PDF_TYPOGRAPHY.label);
  const badgeWidth = Math.min(contentWidth(doc), doc.widthOfString(label) + 20);
  const badgeHeight = 22;
  ensureSpace(doc, badgeHeight + PDF_SPACING.sm);
  const x = doc.x;
  const y = doc.y;
  doc.save();
  doc.roundedRect(x, y, badgeWidth, badgeHeight, 11).fill(colors.background);
  doc
    .fillColor(colors.foreground)
    .text(label, x + 10, y + 7, { width: badgeWidth - 20, lineBreak: false });
  doc.restore();
  doc.x = x;
  doc.y = y + badgeHeight + PDF_SPACING.sm;
}

export function drawSection(doc: PdfDocument, title: string): void {
  ensureSpace(doc, 28);
  const x = doc.page.margins.left;
  const y = doc.y;
  doc.save();
  doc.rect(x, y + 1, 4, 16).fill(PDF_COLORS.orange);
  doc
    .fillColor(PDF_COLORS.ink)
    .font("Helvetica-Bold")
    .fontSize(PDF_TYPOGRAPHY.section)
    .text(title, x + 12, y + 2, { width: contentWidth(doc) - 12 });
  doc.restore();
  doc.x = x;
  doc.y = y + 26;
}

export function measureFieldRow(
  doc: PdfDocument,
  field: PdfField,
  labelWidth = 150,
): number {
  const gap = PDF_SPACING.md;
  const valueWidth = contentWidth(doc) - labelWidth - gap;
  doc.font("Helvetica").fontSize(PDF_TYPOGRAPHY.body);
  const labelHeight = doc.heightOfString(field.label, { width: labelWidth });
  const valueHeight = doc.heightOfString(field.value, { width: valueWidth });
  return Math.max(labelHeight, valueHeight) + PDF_SPACING.sm;
}

export function drawFieldRow(
  doc: PdfDocument,
  field: PdfField,
  labelWidth = 150,
): void {
  const rowHeight = measureFieldRow(doc, field, labelWidth);
  ensureSpace(doc, rowHeight);
  const x = doc.page.margins.left;
  const y = doc.y;
  const gap = PDF_SPACING.md;
  const valueWidth = contentWidth(doc) - labelWidth - gap;

  doc
    .fillColor(PDF_COLORS.muted)
    .font("Helvetica")
    .fontSize(PDF_TYPOGRAPHY.label)
    .text(field.label, x, y, { width: labelWidth });
  doc
    .fillColor(PDF_COLORS.ink)
    .font("Helvetica")
    .fontSize(PDF_TYPOGRAPHY.body)
    .text(field.value, x + labelWidth + gap, y, { width: valueWidth });
  doc.x = x;
  doc.y = y + rowHeight;
}

export function drawInformationCard(
  doc: PdfDocument,
  fields: readonly PdfField[],
  title?: string,
): void {
  const padding = PDF_SPACING.md;
  const titleHeight = title ? 22 : 0;
  const labelWidth = 130;
  const gap = PDF_SPACING.md;
  const innerWidth = contentWidth(doc) - padding * 2;
  const valueWidth = innerWidth - labelWidth - gap;
  doc.font("Helvetica").fontSize(PDF_TYPOGRAPHY.body);
  const rowHeights = fields.map((field) => {
    const labelHeight = doc.heightOfString(field.label, { width: labelWidth });
    const valueHeight = doc.heightOfString(field.value, { width: valueWidth });
    return Math.max(labelHeight, valueHeight) + PDF_SPACING.sm;
  });
  const rowsHeight = rowHeights.reduce((height, rowHeight) => height + rowHeight, 0);
  const cardHeight = padding * 2 + titleHeight + rowsHeight;
  const availablePageHeight = contentBottom(doc) - doc.page.margins.top;
  if (cardHeight > availablePageHeight) {
    throw new RangeError("La carte d’information est trop haute pour tenir sur une page.");
  }
  ensureSpace(doc, cardHeight);
  const x = doc.page.margins.left;
  const y = doc.y;
  const width = contentWidth(doc);

  doc.save();
  doc.roundedRect(x, y, width, cardHeight, 6).fillAndStroke(PDF_COLORS.surfaceMuted, PDF_COLORS.border);
  doc.restore();
  let rowY = y + padding;
  if (title) {
    doc
      .fillColor(PDF_COLORS.ink)
      .font("Helvetica-Bold")
      .fontSize(PDF_TYPOGRAPHY.body)
      .text(title, x + padding, rowY, { width: innerWidth });
    rowY += titleHeight;
  }
  fields.forEach((field, index) => {
    doc
      .fillColor(PDF_COLORS.muted)
      .font("Helvetica")
      .fontSize(PDF_TYPOGRAPHY.label)
      .text(field.label, x + padding, rowY, { width: labelWidth });
    doc
      .fillColor(PDF_COLORS.ink)
      .font("Helvetica")
      .fontSize(PDF_TYPOGRAPHY.body)
      .text(field.value, x + padding + labelWidth + gap, rowY, { width: valueWidth });
    rowY += rowHeights[index] ?? 0;
  });
  doc.x = x;
  doc.y = y + cardHeight + PDF_SPACING.md;
}

export function drawBulletList(
  doc: PdfDocument,
  items: readonly string[],
  emptyLabel = "Aucun élément.",
): void {
  const values = items.length > 0 ? items : [emptyLabel];
  const x = doc.page.margins.left;
  const textX = x + 14;
  const width = contentWidth(doc) - 14;

  for (const item of values) {
    doc.font("Helvetica").fontSize(PDF_TYPOGRAPHY.body);
    const height = doc.heightOfString(item, { width }) + PDF_SPACING.sm;
    ensureSpace(doc, height);
    const y = doc.y;
    doc.fillColor(PDF_COLORS.orange).circle(x + 4, y + 5, 2).fill();
    doc.fillColor(PDF_COLORS.ink).text(item, textX, y, { width });
    doc.x = x;
    doc.y = y + height;
  }
}

export function drawSignatureBlock(
  doc: PdfDocument,
  signatures: readonly PdfSignature[],
): void {
  if (signatures.length === 0) {
    return;
  }
  const gap = PDF_SPACING.lg;
  const width = (contentWidth(doc) - gap * (signatures.length - 1)) / signatures.length;
  doc.font("Helvetica-Bold").fontSize(PDF_TYPOGRAPHY.label);
  const headingHeight = signatures.reduce(
    (height, signature) => Math.max(height, doc.heightOfString(signature.label, { width })),
    0,
  );
  doc.font("Helvetica").fontSize(PDF_TYPOGRAPHY.small);
  const detailsHeights = signatures.map((signature) => {
    const details = [signature.name, signature.role, signature.dateLabel].filter(
      (value): value is string => Boolean(value),
    );
    const detailsHeight = details.length
      ? doc.heightOfString(details.join(" · "), { width, align: "center" })
      : 0;
    const footerHeight = signature.footerLabel
      ? doc.heightOfString(signature.footerLabel, { width, align: "center" })
      : 0;
    return detailsHeight + footerHeight + (detailsHeight && footerHeight ? PDF_SPACING.xs : 0);
  });
  const lineY = headingHeight + 48;
  const blockHeight = lineY + 8 + Math.max(...detailsHeights, 0) + PDF_SPACING.sm;
  ensureSpace(doc, blockHeight);
  const x = doc.page.margins.left;
  const y = doc.y;

  signatures.forEach((signature, index) => {
    const columnX = x + index * (width + gap);
    doc
      .fillColor(PDF_COLORS.ink)
      .font("Helvetica-Bold")
      .fontSize(PDF_TYPOGRAPHY.label)
      .text(signature.label, columnX, y, { width, align: "center" });
    doc
      .moveTo(columnX, y + lineY)
      .lineTo(columnX + width, y + lineY)
      .strokeColor(PDF_COLORS.border)
      .lineWidth(0.7)
      .stroke();
    const details = [signature.name, signature.role, signature.dateLabel].filter(
      (value): value is string => Boolean(value),
    );
    const detailsY = y + lineY + 7;
    doc
      .fillColor(PDF_COLORS.muted)
      .font("Helvetica")
      .fontSize(PDF_TYPOGRAPHY.small)
      .text(details.join(" · "), columnX, detailsY, { width, align: "center" });
    if (signature.footerLabel) {
      const footerY =
        detailsY +
        (details.length
          ? doc.heightOfString(details.join(" · "), { width, align: "center" }) + PDF_SPACING.xs
          : 0);
      doc.text(signature.footerLabel, columnX, footerY, { width, align: "center" });
    }
  });
  doc.x = x;
  doc.y = y + blockHeight;
}

export function drawQrBlock(doc: PdfDocument, options: PdfQrBlockOptions): void {
  const size = options.size ?? 76;
  const width = contentWidth(doc);
  const textWidth = width - size - PDF_SPACING.xl - PDF_SPACING.md;
  doc.font("Helvetica-Bold").fontSize(PDF_TYPOGRAPHY.body);
  const labelHeight = doc.heightOfString(options.label, { width: textWidth });
  doc.font("Helvetica").fontSize(PDF_TYPOGRAPHY.label);
  const descriptionHeight = options.description
    ? doc.heightOfString(options.description, { width: textWidth })
    : 0;
  const textHeight =
    labelHeight + (descriptionHeight ? PDF_SPACING.xs + descriptionHeight : 0);
  const height = Math.max(size, textHeight) + PDF_SPACING.md * 2;
  ensureSpace(doc, height);
  const x = doc.page.margins.left;
  const y = doc.y;

  doc.save();
  doc.roundedRect(x, y, width, height, 6).strokeColor(PDF_COLORS.border).stroke();
  if (options.image) {
    doc.image(options.image, x + PDF_SPACING.md, y + PDF_SPACING.md, {
      width: size,
      height: size,
      fit: [size, size],
      align: "center",
      valign: "center",
    });
  } else {
    doc
      .rect(x + PDF_SPACING.md, y + PDF_SPACING.md, size, size)
      .dash(3, { space: 3 })
      .strokeColor(PDF_COLORS.muted)
      .stroke()
      .undash();
    doc
      .fillColor(PDF_COLORS.muted)
      .font("Helvetica")
      .fontSize(PDF_TYPOGRAPHY.small)
      .text("ZONE QR", x + PDF_SPACING.md, y + size / 2 + 6, {
        width: size,
        align: "center",
        lineBreak: false,
      });
  }
  const textX = x + size + PDF_SPACING.xl;
  const textY = y + (height - textHeight) / 2;
  doc
    .fillColor(PDF_COLORS.ink)
    .font("Helvetica-Bold")
    .fontSize(PDF_TYPOGRAPHY.body)
    .text(options.label, textX, textY, { width: textWidth });
  if (options.description) {
    doc
      .fillColor(PDF_COLORS.muted)
      .font("Helvetica")
      .fontSize(PDF_TYPOGRAPHY.label)
      .text(options.description, textX, textY + labelHeight + PDF_SPACING.xs, {
        width: textWidth,
      });
  }
  doc.restore();
  doc.x = x;
  doc.y = y + height + PDF_SPACING.md;
}

export function drawWatermark(
  doc: PdfDocument,
  text: string,
  options: { color?: string; opacity?: number; angle?: number } = {},
): void {
  const centerX = doc.page.width / 2;
  const centerY = doc.page.height / 2;
  const cursor = { x: doc.x, y: doc.y };
  doc.save();
  doc
    .opacity(options.opacity ?? 0.08)
    .fillColor(options.color ?? PDF_COLORS.orangeDark)
    .font("Helvetica-Bold")
    .fontSize(48)
    .rotate(options.angle ?? -32, { origin: [centerX, centerY] })
    .text(text, doc.page.margins.left, centerY - 24, {
      width: contentWidth(doc),
      align: "center",
      lineBreak: false,
    });
  doc.restore();
  doc.opacity(1);
  doc.x = cursor.x;
  doc.y = cursor.y;
}
