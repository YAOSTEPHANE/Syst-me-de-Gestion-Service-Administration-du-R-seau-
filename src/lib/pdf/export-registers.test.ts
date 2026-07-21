import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";

import {
  renderAgrementsExportPdf,
  renderAttestationsDomiciliationExportPdf,
  renderBancarisationExportPdf,
  renderConcessionnairesExportPdf,
  renderPdvIntegrationsExportPdf,
} from "@/lib/pdf";

interface ParsedPdf {
  pageCount: number;
  pages: string[];
  dimensions: Array<{ width: number; height: number }>;
}

async function readPdf(buffer: Buffer): Promise<ParsedPdf> {
  const loadingTask = getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
  });
  const pdf = await loadingTask.promise;
  const pages: string[] = [];
  const dimensions: Array<{ width: number; height: number }> = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    dimensions.push({ width: viewport.width, height: viewport.height });
    pages.push(
      content.items
        .map((item) => ("str" in item ? item.str : ""))
        .filter(Boolean)
        .join(" "),
    );
  }
  await pdf.destroy();
  return { pageCount: pages.length, pages, dimensions };
}

const generatedAt = new Date("2026-07-21T09:40:00.000Z");
const options = {
  generatedAt,
  filters: ["Agence : ABIDJAN-01", "Statut : FINALISE"],
};

describe("exports de registres PDF premium", () => {
  it.each([
    {
      name: "agréments",
      render: () =>
        renderAgrementsExportPdf(
          [
            {
              reference: "AGR-000042",
              produitCode: "PMU",
              dateReception: generatedAt,
              referenceOfficielle: "DEC-2026-042",
              agenceId: "ABIDJAN-01",
              statut: "FINALISE",
              observations: "Décision reçue et contrôlée",
            },
          ],
          options,
        ),
      expected: ["Synthèse des agréments", "RÉF. OFFICIELLE", "AGR-000042"],
      landscape: true,
    },
    {
      name: "bancarisation",
      render: () =>
        renderBancarisationExportPdf(
          [
            {
              codePdv: "PDV-100",
              nom: "Distribution Plateau",
              statutBancarisation: "BANCAIRE",
              compteBancaire: "CI9300100100000123456789012",
              banqueEtablissement: "Banque Atlantique",
              agenceId: "ABIDJAN-01",
              produitsAutorises: ["PMU", "LOTO"],
            },
          ],
          options,
        ),
      expected: ["Synthèse de la bancarisation", "BANQUE", "Distribution Plateau"],
      landscape: true,
    },
    {
      name: "concessionnaires",
      render: () =>
        renderConcessionnairesExportPdf(
          [
            {
              codePdv: "PDV-200",
              codeTerminal: "TERM-200",
              codeConcessionnaire: "CONS-200",
              nom: "Awa Services",
              cniNumero: "CI012345678",
              telephonePrincipal: "+225 01 23 45 67 89",
              agenceId: "ABIDJAN-01",
              statut: "ACTIF",
            },
          ],
          options,
        ),
      expected: ["Registre des concessionnaires", "TÉLÉPHONE", "CONS-200"],
      landscape: true,
    },
    {
      name: "intégrations PDV",
      render: () =>
        renderPdvIntegrationsExportPdf(
          [
            {
              reference: "INT-000078",
              codePdv: "PDV-300",
              agenceId: "ABIDJAN-01",
              produitCode: "LOTO",
              nombreDemandes: 4,
              dateDemande: generatedAt,
              status: "FINALISE",
              observations: "Intégration terminée",
            },
          ],
          options,
        ),
      expected: ["Journal des intégrations PDV", "DEMANDES", "INT-000078"],
      landscape: true,
    },
    {
      name: "attestations et domiciliation",
      render: () =>
        renderAttestationsDomiciliationExportPdf(
          [
            {
              type: "ATTESTATION_REVENU",
              concessionnaireId: "CONS-300",
              produitCode: "PMU",
              dateDemande: generatedAt,
              statut: "Envoyé au client",
              observations: "Transmission confirmée",
            },
          ],
          options,
        ),
      expected: ["Attestations et domiciliations", "CONCESSIONNAIRE", "CONS-300"],
      landscape: false,
    },
  ])(
    "rend l’export $name avec méta, tableau et pied",
    async ({ render, expected, landscape }) => {
      const parsed = await readPdf(await render());
      const text = parsed.pages.join(" ");

      expect(parsed.pageCount).toBe(1);
      expect(text).toContain("LONACI");
      expect(text).toContain("Informations de l’export");
      expect(text).toContain("Agence : ABIDJAN-01");
      expect(text).toContain("Page 1/1");
      for (const value of expected) {
        expect(text).toContain(value);
      }
      for (const dimension of parsed.dimensions) {
        expect(dimension.width > dimension.height).toBe(landscape);
      }
    },
  );

  it("pagine avant les lignes et répète en-tête et pied", async () => {
    const rows = Array.from({ length: 95 }, (_, index) => ({
      reference: `AGR-${String(index + 1).padStart(6, "0")}`,
      produitCode: "PMU",
      dateReception: generatedAt,
      referenceOfficielle: `DEC-2026-${String(index + 1).padStart(3, "0")}`,
      agenceId: "ABIDJAN-01",
      statut: "FINALISE",
      observations: `Observation de contrôle ${index + 1}`,
    }));
    const parsed = await readPdf(await renderAgrementsExportPdf(rows, options));

    expect(parsed.pageCount).toBeGreaterThan(1);
    expect(parsed.pages.join(" ")).toContain("AGR-000095");
    for (const [index, page] of parsed.pages.entries()) {
      expect(page).toContain("RÉFÉRENCE");
      expect(page).toContain("OBSERVATIONS");
      expect(page).toContain(`Page ${index + 1}/${parsed.pageCount}`);
    }
  });
});
