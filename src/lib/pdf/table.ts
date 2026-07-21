import type { PdfDocument } from "./document";
import { contentBottom, contentWidth } from "./document";
import { ensureSpace } from "./primitives";
import { PDF_COLORS, PDF_SPACING, PDF_TYPOGRAPHY } from "./tokens";

export type PdfTableCellValue = string | number | boolean | Date | null | undefined;
export type PdfTableAlignment = "left" | "center" | "right";

export interface PdfTableColumn<Row> {
  header: string;
  width: number;
  value: (row: Row) => PdfTableCellValue;
  format?: (value: PdfTableCellValue, row: Row) => string;
  align?: PdfTableAlignment;
}

export interface DrawPaginatedTableOptions<Row> {
  columns: readonly PdfTableColumn<Row>[];
  rows: readonly Row[];
  emptyLabel?: string;
  headerHeight?: number;
  rowPadding?: number;
  minRowHeight?: number;
}

function formatCell<Row>(column: PdfTableColumn<Row>, row: Row): string {
  const value = column.value(row);
  if (column.format) {
    return column.format(value, row);
  }
  if (value === null || value === undefined) {
    return "—";
  }
  if (value instanceof Date) {
    return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(value);
  }
  return String(value);
}

function validateColumns<Row>(
  doc: PdfDocument,
  columns: readonly PdfTableColumn<Row>[],
): void {
  if (columns.length === 0) {
    throw new Error("Le tableau doit contenir au moins une colonne.");
  }
  const totalWidth = columns.reduce((sum, column) => sum + column.width, 0);
  if (totalWidth > contentWidth(doc) + 0.01) {
    throw new RangeError(
      `La largeur des colonnes (${totalWidth}) dépasse la zone utile (${contentWidth(doc)}).`,
    );
  }
  if (columns.some((column) => column.width <= 0)) {
    throw new RangeError("Chaque colonne doit avoir une largeur positive.");
  }
}

function drawHeaderRow<Row>(
  doc: PdfDocument,
  columns: readonly PdfTableColumn<Row>[],
  height: number,
): void {
  const x = doc.page.margins.left;
  const y = doc.y;
  const totalWidth = columns.reduce((sum, column) => sum + column.width, 0);
  doc.save();
  doc.roundedRect(x, y, totalWidth, height, 3).fill(PDF_COLORS.orangeDark);
  let cellX = x;
  for (const column of columns) {
    doc
      .fillColor(PDF_COLORS.surface)
      .font("Helvetica-Bold")
      .fontSize(PDF_TYPOGRAPHY.label)
      .text(column.header, cellX + PDF_SPACING.sm, y + PDF_SPACING.sm, {
        width: column.width - PDF_SPACING.md,
        height: height - PDF_SPACING.md,
        align: column.align ?? "left",
        ellipsis: true,
      });
    cellX += column.width;
  }
  doc.restore();
  doc.x = x;
  doc.y = y + height;
}

function measureRow<Row>(
  doc: PdfDocument,
  row: Row,
  columns: readonly PdfTableColumn<Row>[],
  padding: number,
  minHeight: number,
): number {
  doc.font("Helvetica").fontSize(PDF_TYPOGRAPHY.label);
  const textHeight = columns.reduce((height, column) => {
    const measured = doc.heightOfString(formatCell(column, row), {
      width: column.width - padding * 2,
    });
    return Math.max(height, measured);
  }, 0);
  const maximumHeight = contentBottom(doc) - doc.page.margins.top - 34;
  return Math.min(Math.max(minHeight, textHeight + padding * 2), maximumHeight);
}

function drawDataRow<Row>(
  doc: PdfDocument,
  row: Row,
  rowIndex: number,
  columns: readonly PdfTableColumn<Row>[],
  height: number,
  padding: number,
): void {
  const x = doc.page.margins.left;
  const y = doc.y;
  const totalWidth = columns.reduce((sum, column) => sum + column.width, 0);
  const background = rowIndex % 2 === 0 ? PDF_COLORS.surface : PDF_COLORS.surfaceMuted;

  doc.save();
  doc.rect(x, y, totalWidth, height).fillAndStroke(background, PDF_COLORS.border);
  let cellX = x;
  for (const column of columns) {
    doc
      .moveTo(cellX, y)
      .lineTo(cellX, y + height)
      .lineWidth(0.5)
      .strokeColor(PDF_COLORS.border)
      .stroke();
    doc
      .fillColor(PDF_COLORS.ink)
      .font("Helvetica")
      .fontSize(PDF_TYPOGRAPHY.label)
      .text(formatCell(column, row), cellX + padding, y + padding, {
        width: column.width - padding * 2,
        height: height - padding * 2,
        align: column.align ?? "left",
        ellipsis: true,
      });
    cellX += column.width;
  }
  doc.restore();
  doc.x = x;
  doc.y = y + height;
}

export function drawPaginatedTable<Row>(
  doc: PdfDocument,
  options: DrawPaginatedTableOptions<Row>,
): void {
  validateColumns(doc, options.columns);
  const headerHeight = options.headerHeight ?? 28;
  const padding = options.rowPadding ?? PDF_SPACING.sm;
  const minRowHeight = options.minRowHeight ?? 26;
  ensureSpace(doc, headerHeight + minRowHeight);
  drawHeaderRow(doc, options.columns, headerHeight);

  if (options.rows.length === 0) {
    const x = doc.page.margins.left;
    ensureSpace(doc, minRowHeight);
    doc
      .fillColor(PDF_COLORS.muted)
      .font("Helvetica-Oblique")
      .fontSize(PDF_TYPOGRAPHY.label)
      .text(options.emptyLabel ?? "Aucune donnée.", x + padding, doc.y + padding, {
        width: contentWidth(doc) - padding * 2,
      });
    doc.x = x;
    doc.y += minRowHeight;
    return;
  }

  options.rows.forEach((row, rowIndex) => {
    const rowHeight = measureRow(doc, row, options.columns, padding, minRowHeight);
    if (ensureSpace(doc, rowHeight)) {
      drawHeaderRow(doc, options.columns, headerHeight);
    }
    drawDataRow(doc, row, rowIndex, options.columns, rowHeight, padding);
  });
  doc.moveDown(0.8);
}
