import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";

import {
  buildSoumissionFicheVerificationPayload,
  renderSoumissionFicheDefinitivePdf,
  type SoumissionFicheDefinitiveView,
} from "@/lib/pdf/soumission-fiche-definitive";

const VIEW: SoumissionFicheDefinitiveView = {
  soumissionId: "66f000000000000000000001",
  numeroFicheDefinitive: "FDS-2026-000042",
  referenceFicheCaisse: "SOU-00000001",
  emiseLe: new Date("2026-10-05T10:00:00.000Z").toISOString(),
  nomComplet: "KOUASSI Jean",
  contact: "+2250700110001",
  typeDistributeurLabel: "Nouveau",
  nombreTpe: 1,
  produitCode: "LOTO",
  agenceLabel: "ABJ — Agence Abidjan Plateau",
  montantFCFA: 100_000,
  modeLibelle: "Mobile money",
  paymentReference: "RC-2026-7781",
  validePar: "Chef Service Test",
  ficheCaisseEmisePar: "Agent Test LONACI",
};

async function readPdfText(buffer: Buffer): Promise<{ pageCount: number; text: string }> {
  const pdf = await getDocument({ data: new Uint8Array(buffer), useSystemFonts: true }).promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const content = await (await pdf.getPage(pageNumber)).getTextContent();
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

describe("soumission fiche définitive PDF", () => {
  it("génère une fiche payée en une page avec règlement, QR et visas", async () => {
    const pdf = await renderSoumissionFicheDefinitivePdf(VIEW);
    expect(pdf.subarray(0, 5).toString("utf8")).toBe("%PDF-");

    const { pageCount, text } = await readPdfText(pdf);
    expect(pageCount).toBe(1);
    expect(text).toMatch(/Fiche définitive de paiement/);
    expect(text).toMatch(/FDS-2026-000042/);
    expect(text).toMatch(/SOU-00000001/);
    expect(text).toMatch(/PAYÉE/);
    expect(text).toMatch(/MONTANT RÉGLÉ/);
    expect(text).toMatch(/cent mille/i);
    expect(text).toMatch(/Mobile money/);
    expect(text).toMatch(/RC-2026-7781/);
    expect(text).toMatch(/Visa chef de service/);
    expect(text).toMatch(/QR vérification/);
  });

  it("encode l'identifiant, la fiche et la référence de paiement dans le QR", () => {
    expect(buildSoumissionFicheVerificationPayload(VIEW)).toBe(
      "LONACI|SOUMISSION|66f000000000000000000001|FDS-2026-000042|RC-2026-7781",
    );
  });
});
