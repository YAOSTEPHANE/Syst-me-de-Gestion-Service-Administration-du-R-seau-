import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import QRCode from "qrcode";
import { describe, expect, it } from "vitest";

import type { CautionFicheDefinitiveView } from "@/lib/lonaci/caution-fiche-definitive";
import type { CautionFicheProvisoireView } from "@/lib/lonaci/caution-fiche-provisoire";
import type { CourrierComptabiliteClientView } from "@/lib/lonaci/courrier-comptabilite-client";
import { renderPremiumCautionFicheDefinitivePdf } from "@/lib/pdf/caution-fiche-definitive";
import { renderPremiumCautionFicheProvisoirePdf } from "@/lib/pdf/caution-fiche-provisoire";
import { renderPremiumCourrierComptabiliteClientPdf } from "@/lib/pdf/courrier-comptabilite-client";

interface ParsedPdf {
  pageCount: number;
  pages: string[];
}

async function readPdf(buffer: Buffer): Promise<ParsedPdf> {
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

const definitiveView: CautionFicheDefinitiveView = {
  cautionId: "507f1f77bcf86cd799439011",
  numeroFicheDefinitive: "FPD-2026-000123",
  paymentReference: "PAY-2026-000123",
  datePaiement: "2026-07-20T09:15:00.000Z",
  emiseLe: "2026-07-20T09:20:00.000Z",
  montantFCFA: 250_000,
  modeReglement: "VIREMENT",
  modeLibelle: "Virement",
  identiteLabel: "Concessionnaire",
  identiteDetail: "Société Exemple Distribution",
  clientCode: "CLI-00123",
  lonaciClientId: null,
  contratId: "CTR-2026-001",
  produitCode: "PMU",
  produitLibelle: "Pari mutuel urbain",
  agenceLabel: "Agence Abidjan Centre",
  numeroFicheProvisoire: "FPC-2026-000123",
  destinataireEmail: null,
};

describe("documents LONACI sur le moteur PDF premium", () => {
  it("pagine la fiche provisoire, conserve le filigrane et les coordonnées", async () => {
    const view: CautionFicheProvisoireView = {
      cautionId: "507f1f77bcf86cd799439011",
      numeroDossier: "CAU-2026-TEST-0001",
      generatedAt: "2026-07-20T08:00:00.000Z",
      identiteLabel: "Client",
      identiteDetail: "Client de contrôle structurel",
      identifiantLabel: "Identifiant client",
      identifiantValue: "CLI-0001",
      cniNumero: "CI0123456789",
      codePdv: "PDV-0001",
      agenceLabel: "Agence de test",
      produitLignes: Array.from({ length: 42 }, (_, index) => ({
        code: `P${String(index + 1).padStart(2, "0")}`,
        libelle: `Produit de caution longue ligne ${index + 1}`,
        montantFCFA: 10_000 + index,
      })),
      montantTotalFCFA: 420_861,
      dueDate: "2026-08-20T00:00:00.000Z",
      bank: {
        banque: "Banque partenaire LONACI",
        compte: "CI00 0000 0000 0000",
        iban: "CI93 0000 0000 0000 0000 0000 000",
        libelleVirement: "CAUTION CONCESSIONNAIRE",
      },
    };

    const parsed = await readPdf(await renderPremiumCautionFicheProvisoirePdf(view));

    expect(parsed.pageCount).toBeGreaterThan(1);
    for (const pageText of parsed.pages) {
      expect(pageText).toContain("EN ATTENTE DE PAIEMENT");
      expect(pageText).toContain("LONACI");
      expect(pageText).toMatch(/Page \d+\/\d+/);
    }
    expect(parsed.pages.join(" ")).toContain("Produit de caution longue ligne 42");
    expect(parsed.pages.join(" ")).toContain("CI93 0000 0000");
  });

  it("intègre un vrai QR dans le bloc de vérification de la fiche définitive", async () => {
    const qrPng = await QRCode.toBuffer(
      `LONACI|CAUTION|${definitiveView.cautionId}|${definitiveView.numeroFicheDefinitive}|${definitiveView.paymentReference}`,
      { type: "png", margin: 1, width: 180 },
    );

    const parsed = await readPdf(
      await renderPremiumCautionFicheDefinitivePdf(definitiveView, qrPng),
    );
    const text = parsed.pages.join(" ");

    expect(text).toContain("Vérification QR");
    expect(text).toContain("PAY-2026-000123");
    expect(text).toContain("CAUTION · FICHE DÉFINITIVE");
    expect(text).toContain("Page 1/1");
  });

  it("garde ensemble le cachet/signature après un contenu long", async () => {
    const longName = Array.from(
      { length: 22 },
      (_, index) => `Établissement concessionnaire à dénomination contrôlée ${index + 1}`,
    ).join(" ");
    const view: CourrierComptabiliteClientView = {
      referenceCourrier: "CCOM-FPD-2026-000123",
      generatedAt: new Date("2026-07-20T10:00:00.000Z"),
      datePaiement: new Date("2026-07-20T09:15:00.000Z"),
      destinataireComptabilite: "Direction comptable du concessionnaire",
      nomComplet: longName,
      raisonSociale: "Société Exemple Distribution",
      clientCode: "CLI-00123",
      codePdv: "PDV-0099",
      agenceLabel: "Agence Abidjan Centre",
      produitCode: "PMU",
      produitLibelle: "Pari mutuel urbain",
      montantFCFA: 250_000,
      modeLibelle: "Virement",
      paymentReference: "PAY-2026-000123",
      numeroFicheDefinitive: "FPD-2026-000123",
      numeroFicheProvisoire: "FPC-2026-000123",
      dossierReference: "DOS-2026-00123",
      etabliParAgence: "Agence Abidjan Centre",
    };

    const parsed = await readPdf(await renderPremiumCourrierComptabiliteClientPdf(view));
    const signaturePage = parsed.pages.find((page) => page.includes("Cachet et signature"));

    expect(parsed.pageCount).toBeGreaterThan(1);
    expect(signaturePage).toContain("Pour la LONACI");
    expect(signaturePage).toContain("Agence Abidjan Centre");
    expect(parsed.pages.join(" ")).toContain("PAY-2026-000123");
    for (const pageText of parsed.pages) {
      expect(pageText).toMatch(/Page \d+\/\d+/);
    }
  });
});
