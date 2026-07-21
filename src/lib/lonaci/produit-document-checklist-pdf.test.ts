import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";

import { renderDossierChecklistPdf } from "@/lib/lonaci/produit-document-checklist-pdf";

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

describe("renderDossierChecklistPdf", () => {
  it("conserve les statuts métier et pagine une checklist longue", async () => {
    const buffer = await renderDossierChecklistPdf({
      dossierReference: "DOS-2026-0099",
      produitCode: "PMU",
      produitLibelle: "Pari Mutuel Urbain",
      concessionnaireLabel: "Établissements Konan",
      generatedAt: new Date("2026-07-21T08:00:00.000Z"),
      checklist: {
        complet: false,
        entries: Array.from({ length: 74 }, (_, index) => ({
          itemId: `piece-${index + 1}`,
          libelle: `Document de constitution numéro ${index + 1}`,
          obligatoire: index % 2 === 0,
          statut: index % 3 === 0 ? "FOURNI" : "MANQUANT",
        })),
      },
    });
    const parsed = await readPdf(buffer);
    const text = parsed.pages.join(" ");

    expect(parsed.pageCount).toBeGreaterThan(1);
    expect(text).toContain("Checklist documents");
    expect(text).toContain("État du dossier : INCOMPLET");
    expect(text).toContain("DOS-2026-0099");
    expect(text).toContain("Document de constitution numéro 74");
    expect(text).toContain("(obligatoire)");
    for (const [index, page] of parsed.pages.entries()) {
      expect(page).toContain(`Page ${index + 1}/${parsed.pageCount}`);
    }
  });
});
