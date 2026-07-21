import PDFDocument from "pdfkit";

import { PDF_COLORS, PDF_PAGE, PDF_TYPOGRAPHY } from "./tokens";

export type PdfDocument = InstanceType<typeof PDFDocument>;
export type PdfOrientation = "portrait" | "landscape";

export interface PremiumPdfMetadata {
  title: string;
  subject?: string;
  author?: string;
  keywords?: string[];
  creationDate?: Date;
}

export interface CreatePremiumPdfOptions {
  orientation?: PdfOrientation;
  metadata: PremiumPdfMetadata;
  margins?: Partial<PDFKit.Mixins.ExpandedSides<number>>;
}

export interface PremiumPageChrome {
  reference: string;
  issuedAt: Date;
  documentLabel?: string;
  organizationSubtitle?: string;
  locale?: string;
}

function pageMargins(
  overrides: CreatePremiumPdfOptions["margins"],
): PDFKit.Mixins.ExpandedSides<number> {
  return {
    top: overrides?.top ?? PDF_PAGE.topMargin,
    right: overrides?.right ?? PDF_PAGE.margin,
    bottom: overrides?.bottom ?? PDF_PAGE.bottomMargin,
    left: overrides?.left ?? PDF_PAGE.margin,
  };
}

export function createPremiumPdfDocument(options: CreatePremiumPdfOptions): PdfDocument {
  const creationDate = options.metadata.creationDate ?? new Date();
  const info: PDFKit.DocumentInfo = {
    Title: options.metadata.title,
    Author: options.metadata.author ?? "LONACI",
    Creator: "LONACI",
    Producer: "LONACI — PDFKit",
    CreationDate: creationDate,
    ModDate: creationDate,
  };
  if (options.metadata.subject) {
    info.Subject = options.metadata.subject;
  }
  if (options.metadata.keywords && options.metadata.keywords.length > 0) {
    info.Keywords = options.metadata.keywords.join(", ");
  }
  return new PDFDocument({
    size: "A4",
    layout: options.orientation ?? "portrait",
    margins: pageMargins(options.margins),
    bufferPages: true,
    compress: true,
    info,
  });
}

export function collectPdfBuffer(
  doc: PdfDocument,
  render: () => void | Promise<void>,
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer | Uint8Array) => {
      chunks.push(Buffer.from(chunk));
    });
    doc.once("end", () => {
      resolve(Buffer.concat(chunks));
    });
    doc.once("error", reject);

    Promise.resolve()
      .then(render)
      .then(() => doc.end())
      .catch(reject);
  });
}

function drawPremiumHeader(doc: PdfDocument, chrome: PremiumPageChrome): void {
  const { left, right } = doc.page.margins;
  const width = doc.page.width - left - right;
  const y = 24;

  doc.save();
  doc.roundedRect(left, y, width, PDF_PAGE.headerHeight, 5).fill(PDF_COLORS.orange);
  doc
    .fillColor(PDF_COLORS.surface)
    .font("Helvetica-Bold")
    .fontSize(13)
    .text("LONACI", left + 14, y + 10, { lineBreak: false });
  doc
    .font("Helvetica")
    .fontSize(PDF_TYPOGRAPHY.small)
    .text(
      chrome.organizationSubtitle ?? "Loterie Nationale de Côte d’Ivoire",
      left + 14,
      y + 29,
      { lineBreak: false },
    );
  doc
    .font("Helvetica-Bold")
    .fontSize(PDF_TYPOGRAPHY.label)
    .text(chrome.documentLabel ?? "DOCUMENT INSTITUTIONNEL", left + width / 2, y + 20, {
      width: width / 2 - 14,
      align: "right",
      lineBreak: false,
    });
  doc.restore();
}

function drawPremiumFooter(
  doc: PdfDocument,
  chrome: PremiumPageChrome,
  pageNumber: number,
  pageCount: number,
): void {
  const { left, right } = doc.page.margins;
  const width = doc.page.width - left - right;
  const y = doc.page.height - 36;
  const locale = chrome.locale ?? "fr-FR";
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(chrome.issuedAt);
  const originalBottomMargin = doc.page.margins.bottom;

  doc.save();
  // PDFKit déclenche sinon une page automatique dès qu'un texte est placé
  // dans la réserve du pied, au-dessous de maxY().
  doc.page.margins.bottom = 0;
  doc
    .moveTo(left, y - 8)
    .lineTo(left + width, y - 8)
    .lineWidth(0.6)
    .strokeColor(PDF_COLORS.border)
    .stroke();
  doc
    .fillColor(PDF_COLORS.muted)
    .font("Helvetica")
    .fontSize(PDF_TYPOGRAPHY.small)
    .text(`Réf. ${chrome.reference} · ${date}`, left, y, {
      width: width * 0.72,
      lineBreak: false,
    });
  doc.text(`Page ${pageNumber}/${pageCount}`, left + width * 0.72, y, {
    width: width * 0.28,
    align: "right",
    lineBreak: false,
  });
  doc.page.margins.bottom = originalBottomMargin;
  doc.restore();
}

/**
 * Décore toutes les pages une fois le contenu terminé.
 * Aucun gestionnaire `pageAdded` n'est installé : les écritures absolues ne
 * peuvent donc pas déclencher une chaîne récursive d'ajouts de pages.
 */
export function finalizePremiumPages(doc: PdfDocument, chrome: PremiumPageChrome): void {
  const range = doc.bufferedPageRange();
  const pageCount = range.count;

  for (let offset = 0; offset < pageCount; offset += 1) {
    doc.switchToPage(range.start + offset);
    const cursor = { x: doc.x, y: doc.y };
    drawPremiumHeader(doc, chrome);
    drawPremiumFooter(doc, chrome, offset + 1, pageCount);
    doc.x = cursor.x;
    doc.y = cursor.y;
  }

  if (pageCount > 0) {
    doc.switchToPage(range.start + pageCount - 1);
  }
}

export function contentWidth(doc: PdfDocument): number {
  return doc.page.width - doc.page.margins.left - doc.page.margins.right;
}

export function contentBottom(doc: PdfDocument): number {
  return doc.page.height - doc.page.margins.bottom;
}
