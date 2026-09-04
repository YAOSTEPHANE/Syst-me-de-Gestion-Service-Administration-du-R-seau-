import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";

import {
  formatSoumissionPaiementMontant,
  SOUMISSION_FICHE_PAIEMENT_TITLE,
  SOUMISSION_PAIEMENT_CAISSE_MONTANT_FCFA,
} from "@/lib/lonaci/soumission-paiement-constants";
import { renderSoumissionFichePaiementPdf } from "@/lib/pdf/soumission-fiche-paiement";

async function readPdfText(buffer: Buffer): Promise<{ pageCount: number; text: string }> {
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
  return { pageCount: pages.length, text: pages.join("\n") };
}

describe("soumission paiement constants", () => {
  it("fixe le montant caisse à 100 000 FCFA", () => {
    expect(SOUMISSION_PAIEMENT_CAISSE_MONTANT_FCFA).toBe(100_000);
    expect(formatSoumissionPaiementMontant()).toMatch(/100[\s\u00a0]?000/);
    expect(formatSoumissionPaiementMontant()).toContain("FCFA");
    expect(SOUMISSION_FICHE_PAIEMENT_TITLE).toMatch(/paiement/i);
  });
});

describe("soumission fiche paiement PDF", () => {
  it("génère une fiche caisse lisible en une page avec montant en lettres et consignes", async () => {
    const pdf = await renderSoumissionFichePaiementPdf({
      reference: "SOU-TEST0001",
      nomComplet: "KOUASSI Jean",
      contact: "+2250700110001",
      typeDistributeurLabel: "Nouveau",
      nombreTpe: 1,
      agenceLabel: "ABJ — Agence Abidjan Plateau",
      montantFCFA: SOUMISSION_PAIEMENT_CAISSE_MONTANT_FCFA,
      agentNom: "Agent Test LONACI",
      generatedAt: new Date("2026-08-04T10:00:00.000Z").toISOString(),
      observations: "[seed-soumissions] Donnée de test PDF",
    });

    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.byteLength).toBeGreaterThan(500);
    expect(pdf.subarray(0, 5).toString("utf8")).toBe("%PDF-");

    const { pageCount, text } = await readPdfText(pdf);
    expect(pageCount).toBe(1);
    expect(text).toMatch(/SOU-TEST0001/);
    expect(text).toMatch(/KOUASSI Jean/);
    expect(text).toMatch(/100/);
    expect(text).toMatch(/000/);
    expect(text).toMatch(/FCFA/);
    expect(text).toMatch(/cent mille/i);
    expect(text).toMatch(/CONSIGNES CAISSE/i);
    expect(text).toMatch(/Visa caisse/i);
    expect(text).toMatch(/QR contrôle/i);
  });
});
