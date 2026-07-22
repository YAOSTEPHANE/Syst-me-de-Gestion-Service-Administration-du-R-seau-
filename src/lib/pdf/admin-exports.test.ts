import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";

import {
  renderAdminAgencesExportPdf,
  renderAdminAuthLogsExportPdf,
  renderAdminProduitsExportPdf,
  renderAdminUsersExportPdf,
  type AdminUserExportRow,
} from "@/lib/pdf";

interface ParsedPdf {
  pageCount: number;
  pages: string[];
  firstPageWidth: number;
  firstPageHeight: number;
}

async function readPdf(buffer: Buffer): Promise<ParsedPdf> {
  const loadingTask = getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
  });
  const pdf = await loadingTask.promise;
  const pages: string[] = [];
  let firstPageWidth = 0;
  let firstPageHeight = 0;

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    if (pageNumber === 1) {
      const viewport = page.getViewport({ scale: 1 });
      firstPageWidth = viewport.width;
      firstPageHeight = viewport.height;
    }
    const content = await page.getTextContent();
    pages.push(
      content.items
        .map((item) => ("str" in item ? item.str : ""))
        .filter(Boolean)
        .join(" "),
    );
  }
  await pdf.destroy();

  return {
    pageCount: pages.length,
    pages,
    firstPageWidth,
    firstPageHeight,
  };
}

const generatedAt = new Date("2026-07-21T09:30:00.000Z");

describe("exports PDF premium de l’administration", () => {
  it("conserve les données des quatre exports dans une structure institutionnelle", async () => {
    const buffers = await Promise.all([
      renderAdminAgencesExportPdf(
        [
          {
            code: "AG-PLATEAU",
            libelle: "Agence Plateau",
            zone: "Abidjan",
            statut: "ACTIF",
            id: "agence-001",
          },
        ],
        generatedAt,
      ),
      renderAdminProduitsExportPdf(
        [
          {
            code: "PMU",
            libelle: "Pari Mutuel Urbain",
            prix: 500,
            prixKit: 50,
            statut: "ACTIF",
            id: "produit-001",
          },
        ],
        generatedAt,
      ),
      renderAdminUsersExportPdf(
        [
          {
            nomComplet: "Awa Koné",
            email: "awa@example.ci",
            matricule: "MAT-001",
            role: "CHEF_SERVICE",
            agence: "agence-001",
            statut: "ACTIF",
            derniereConnexion: generatedAt,
          },
        ],
        {
          status: "ACTIF",
          role: "CHEF_SERVICE",
          agence: "agence-001",
          recherche: "Awa",
        },
        generatedAt,
      ),
      renderAdminAuthLogsExportPdf(
        [
          {
            attemptedAt: generatedAt,
            status: "FAILED",
            email: "audit@example.ci",
            ipAddress: "192.0.2.10",
            reason: "Mot de passe incorrect",
          },
        ],
        {
          email: "audit@example.ci",
          status: "FAILED",
          from: "2026-07-01T00:00:00.000Z",
          to: "2026-07-21T23:59:59.000Z",
        },
        generatedAt,
      ),
    ]);
    const parsedDocuments = await Promise.all(buffers.map(readPdf));
    const expectedValues = [
      ["Export des agences", "AG-PLATEAU", "agence-001"],
      ["Export des produits", "PMU", "produit-001"],
      ["Export des utilisateurs", "awa@example.ci", "MAT-001"],
      ["Journal d’authentification", "audit@example.ci", "Mot de passe incorrect"],
    ];

    parsedDocuments.forEach((parsed, documentIndex) => {
      const text = parsed.pages.join(" ");
      expect(parsed.firstPageWidth).toBeGreaterThan(parsed.firstPageHeight);
      expect(text).toContain("LONACI");
      expect(text).toContain("Synthèse de l’export");
      expect(text).toContain("Page 1/1");
      for (const expected of expectedValues[documentIndex] ?? []) {
        expect(text).toContain(expected);
      }
    });
  });

  it("pagine un tableau large, répète son en-tête et numérote chaque page", async () => {
    const rows: AdminUserExportRow[] = Array.from({ length: 90 }, (_, index) => ({
      nomComplet: `Utilisateur Institutionnel ${index + 1}`,
      email: `utilisateur-${index + 1}@example.ci`,
      matricule: `MAT-${String(index + 1).padStart(3, "0")}`,
      role: "AGENT",
      agence: `AG-${(index % 5) + 1}`,
      statut: index % 2 === 0 ? "ACTIF" : "INACTIF",
      derniereConnexion: generatedAt,
    }));
    const parsed = await readPdf(
      await renderAdminUsersExportPdf(
        rows,
        {
          status: "ALL",
          role: "ALL",
          agence: "ALL",
          recherche: "",
        },
        generatedAt,
      ),
    );

    expect(parsed.pageCount).toBeGreaterThan(1);
    expect(parsed.pages.join(" ")).toContain("utilisateur-90@example.ci");
    parsed.pages.forEach((page, index) => {
      expect(page).toContain("DERNIÈRE CONNEXION");
      expect(page).toContain(`Page ${index + 1}/${parsed.pageCount}`);
      expect(page).toContain("LONACI");
    });
  });
});
