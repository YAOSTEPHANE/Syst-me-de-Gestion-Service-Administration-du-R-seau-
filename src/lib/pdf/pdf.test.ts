import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";

import {
  collectPdfBuffer,
  contentWidth,
  createPdfResponse,
  createPremiumPdfDocument,
  drawPaginatedTable,
  drawTitle,
  finalizePremiumPages,
  safePdfFilename,
  type PdfTableColumn,
} from "@/lib/pdf";

async function readPdf(buffer: Buffer): Promise<{ pageCount: number; pages: string[] }> {
  const loadingTask = getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
  });
  const pdf = await loadingTask.promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(
      content.items
        .map((item) => ("str" in item ? item.str : ""))
        .filter(Boolean)
        .join(" "),
    );
  }
  await pdf.destroy();
  return { pageCount: pages.length, pages };
}

describe("socle PDF premium", () => {
  it("collecte un Buffer PDF et expose le texte institutionnel", async () => {
    const doc = createPremiumPdfDocument({
      metadata: {
        title: "Attestation premium",
        subject: "Test structurel",
        creationDate: new Date("2026-07-21T08:00:00.000Z"),
      },
    });
    const buffer = await collectPdfBuffer(doc, () => {
      drawTitle(doc, "Attestation de conformité", "Document de validation");
      doc.font("Helvetica").fontSize(10).text("Contenu métier de contrôle.");
      finalizePremiumPages(doc, {
        reference: "TEST-001",
        issuedAt: new Date("2026-07-21T08:00:00.000Z"),
        documentLabel: "ATTESTATION",
      });
    });

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.subarray(0, 5).toString("ascii")).toBe("%PDF-");

    const parsed = await readPdf(buffer);
    expect(parsed.pageCount).toBe(1);
    expect(parsed.pages[0]).toContain("LONACI");
    expect(parsed.pages[0]).toContain("Attestation de conformité");
    expect(parsed.pages[0]).toContain("Réf. TEST-001");
    expect(parsed.pages[0]).toContain("Page 1/1");
  });

  it("pagine un tableau typé et répète son en-tête", async () => {
    interface TestRow {
      index: number;
      description: string;
    }

    const doc = createPremiumPdfDocument({
      orientation: "landscape",
      metadata: { title: "Tableau paginé" },
    });
    const columns: readonly PdfTableColumn<TestRow>[] = [
      { header: "NUMERO", width: 100, value: (row) => row.index, align: "right" },
      { header: "DESCRIPTION CONTROLE", width: 560, value: (row) => row.description },
    ];
    const rows: TestRow[] = Array.from({ length: 72 }, (_, index) => ({
      index: index + 1,
      description: `Ligne de vérification institutionnelle ${index + 1}`,
    }));

    const buffer = await collectPdfBuffer(doc, () => {
      drawTitle(doc, "Registre de contrôle");
      expect(columns.reduce((sum, column) => sum + column.width, 0)).toBeLessThan(
        contentWidth(doc),
      );
      drawPaginatedTable(doc, { columns, rows });
      finalizePremiumPages(doc, {
        reference: "TABLE-072",
        issuedAt: new Date("2026-07-21T08:00:00.000Z"),
      });
    });

    const parsed = await readPdf(buffer);
    expect(parsed.pageCount).toBeGreaterThan(1);
    for (const pageText of parsed.pages) {
      expect(pageText).toContain("DESCRIPTION CONTROLE");
      expect(pageText).toMatch(/Page \d+\/\d+/);
    }
    expect(parsed.pages.join(" ")).toContain("Ligne de vérification institutionnelle 72");
  });

  it("produit une réponse HTTP sûre sans dépendre d'une route Next.js", async () => {
    expect(safePdfFilename("../../État des cautions\r\n2026")).toBe(
      "Etat-des-cautions-2026.pdf",
    );
    const response = createPdfResponse(Buffer.from("%PDF-test"), {
      filename: "État des cautions",
    });

    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toContain(
      'filename="Etat-des-cautions.pdf"',
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-security-policy")).toBe("sandbox");
    expect(await response.text()).toBe("%PDF-test");
  });
});
