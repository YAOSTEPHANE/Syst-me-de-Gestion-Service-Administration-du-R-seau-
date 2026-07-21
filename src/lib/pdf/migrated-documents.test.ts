import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  renderActeCessionPdf,
  type ActeCessionView,
} from "@/lib/lonaci/acte-cession";
import {
  renderActeDelocalisationPdf,
  type ActeDelocalisationView,
} from "@/lib/lonaci/acte-delocalisation";
import {
  renderDossierDechargeContratPdf,
  type DossierDechargeContratView,
} from "@/lib/lonaci/dossier-decharge-contrat";
import {
  renderDossierDechargeDefinitivePdf,
  type DossierDechargeDefinitiveView,
} from "@/lib/lonaci/dossier-decharge-definitive";
import {
  renderDossierDechargeProvisoirePdf,
  type DossierDechargeProvisoireView,
} from "@/lib/lonaci/dossier-decharge-provisoire";

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

const generatedAt = new Date("2026-07-21T09:00:00.000Z");

const provisoireView: DossierDechargeProvisoireView = {
  dossierReference: "DOS-PROV-001",
  dossierStatus: "VALIDE_N1",
  generatedAt,
  identiteLabel: "Concessionnaire",
  identiteDetail: "Kouassi Distribution",
  codePdv: "PDV-001",
  cniNumero: "CI0123456",
  agenceLabel: "Agence Abidjan Centre",
  produitCode: "PMU",
  produitLibelle: "Pari Mutuel Urbain",
  produitCodes: ["PMU"],
  produitLibelles: ["Pari Mutuel Urbain"],
  documentsFournis: ["Copie de la CNI"],
  documentsManquants: ["Plan de localisation — Manquant"],
  caution: {
    cautionId: "507f1f77bcf86cd799439011",
    referenceLabel: "FPC-001",
    paymentReference: null,
    status: "EN_ATTENTE",
    numeroFicheProvisoire: "FPC-001",
    numeroFicheDefinitive: null,
  },
  cautions: [],
};

const definitiveView: DossierDechargeDefinitiveView = {
  dossierReference: "DOS-DEF-001",
  generatedAt,
  dateValidation: generatedAt,
  mention: "DOSSIER COMPLET",
  nomComplet: "Awa Koné",
  raisonSociale: "Awa Koné Services",
  codePdv: "PDV-002",
  codeTerminal: "T-204",
  codeConcessionnaire: "C-204",
  cniNumero: "CI6543210",
  email: "awa@example.ci",
  telephone: "+225 01 02 03 04 05",
  adresse: "Boulevard de la République",
  ville: "Abidjan",
  agenceLabel: "Agence Plateau",
  produitCode: "LOTO",
  produitLibelle: "Loto Bonheur",
  produitCodes: ["LOTO"],
  produitLibelles: ["Loto Bonheur"],
  documentsFournis: ["CNI", "Photo du point de vente"],
  paymentReference: "PAY-2026-001",
  cautionMontantFCFA: 500000,
  cautionPaidAt: generatedAt,
  numeroFicheProvisoire: "FPC-002",
  numeroFicheDefinitive: "FPD-002",
  cautionReferenceLabel: "FPD-002",
};

const contratView: DossierDechargeContratView = {
  dossierReference: "DOS-CTR-001",
  generatedAt,
  dateRemise: generatedAt,
  mention: "CONTRAT REMIS",
  nomComplet: "Yao N'Guessan",
  raisonSociale: "Yao N'Guessan",
  codePdv: "PDV-003",
  agenceLabel: "Agence Cocody",
  produits: [
    {
      produitCode: "PMU",
      produitLibelle: "Pari Mutuel Urbain",
      referenceContrat: "CTR-2026-001",
      referenceAnnexe: "ANN-2026-001",
    },
  ],
  etabliPar: "Agent LONACI",
};

const cessionView: ActeCessionView = {
  cessionId: "507f1f77bcf86cd799439012",
  reference: "CES-2026-001",
  dateDemande: generatedAt.toISOString(),
  motif: "Transmission du point de vente",
  statut: "VALIDÉE",
  produitCode: "PMU",
  produitLibelle: "Pari Mutuel Urbain",
  contratCedantId: "CTR-CEDANT-001",
  cedant: {
    nomComplet: "Cédant SARL",
    codePdv: "PDV-004",
    cniNumero: "CI1111111",
    telephone: "+225 05 00 00 00 01",
    email: "cedant@example.ci",
    adresse: "Marcory Zone 4",
    agenceLabel: "Agence Marcory",
  },
  beneficiaire: {
    nomComplet: "Cessionnaire SARL",
    codePdv: "PDV-005",
    cniNumero: "CI2222222",
    telephone: "+225 05 00 00 00 02",
    email: "cessionnaire@example.ci",
    adresse: "Treichville",
    agenceLabel: "Agence Treichville",
  },
  emisLe: generatedAt.toISOString(),
};

const delocalisationView: ActeDelocalisationView = {
  cessionId: "507f1f77bcf86cd799439013",
  reference: "DEL-2026-001",
  dateDemande: generatedAt.toISOString(),
  motif: "Rapprochement de la clientèle",
  produitCode: "LOTO",
  produitLibelle: "Loto Bonheur",
  nomComplet: "Point de vente Soleil",
  codePdv: "PDV-006",
  ancienneAdresse: "Rue des Jardins",
  ancienneAgenceLabel: "Agence Deux-Plateaux",
  nouvelleAdresse: "Boulevard Latrille",
  nouvelleAgenceLabel: "Agence Cocody",
  nouvelleGps: { lat: 5.3651, lng: -3.9952 },
  emisLe: generatedAt.toISOString(),
  linkedOperationId: "OP-2026-009",
};

describe("documents métier migrés vers le socle PDF", () => {
  it.each([
    {
      name: "décharge provisoire",
      render: () => renderDossierDechargeProvisoirePdf(provisoireView),
      expected: ["DÉCHARGE PROVISOIRE", "DOS-PROV-001", "Plan de localisation"],
    },
    {
      name: "décharge définitive",
      render: () => renderDossierDechargeDefinitivePdf(definitiveView),
      expected: ["DÉCHARGE DÉFINITIVE", "PAY-2026-001", "FPD-002"],
    },
    {
      name: "remise de contrat",
      render: () => renderDossierDechargeContratPdf(contratView),
      expected: ["REMISE DU CONTRAT", "CTR-2026-001", "Signature du client"],
    },
    {
      name: "acte de cession",
      render: () => renderActeCessionPdf(cessionView),
      expected: ["ACTE DE CESSION", "CTR-CEDANT-001", "Le Chef de Service LONACI"],
    },
    {
      name: "acte de délocalisation",
      render: () => renderActeDelocalisationPdf(delocalisationView),
      expected: ["ACTE DE DÉLOCALISATION", "5.365100", "OP-2026-009"],
    },
  ])("préserve la structure et les références de la $name", async ({ render, expected }) => {
    const parsed = await readPdf(await render());
    const text = parsed.pages.join(" ");
    expect(parsed.pageCount).toBeGreaterThanOrEqual(1);
    expect(text).toContain("LONACI");
    for (const value of expected) {
      expect(text).toContain(value);
    }
    for (const [index, page] of parsed.pages.entries()) {
      expect(page).toContain(`Page ${index + 1}/${parsed.pageCount}`);
    }
  });

  it("pagine les longues listes de pièces sans perdre leur dernier élément", async () => {
    const documentsManquants = Array.from(
      { length: 100 },
      (_, index) => `Pièce complémentaire ${index + 1} — En attente`,
    );
    const parsed = await readPdf(
      await renderDossierDechargeProvisoirePdf({
        ...provisoireView,
        documentsManquants,
      }),
    );
    expect(parsed.pageCount).toBeGreaterThan(1);
    expect(parsed.pages.join(" ")).toContain("Pièce complémentaire 100");
    for (const [index, page] of parsed.pages.entries()) {
      expect(page).toContain(`Page ${index + 1}/${parsed.pageCount}`);
      expect(page).toContain("LONACI");
    }
  });

  it("pagine une remise multiproduit et conserve toutes les références", async () => {
    const produits = Array.from({ length: 80 }, (_, index) => ({
      produitCode: `PRD-${index + 1}`,
      produitLibelle: `Produit institutionnel ${index + 1}`,
      referenceContrat: `CTR-2026-${String(index + 1).padStart(3, "0")}`,
      referenceAnnexe: `ANN-2026-${String(index + 1).padStart(3, "0")}`,
    }));
    const parsed = await readPdf(
      await renderDossierDechargeContratPdf({
        ...contratView,
        produits,
      }),
    );
    expect(parsed.pageCount).toBeGreaterThan(1);
    const text = parsed.pages.join(" ");
    expect(text).toContain("CTR-2026-080");
    expect(text).toContain("ANN-2026-080");
    for (const [index, page] of parsed.pages.entries()) {
      expect(page).toContain(`Page ${index + 1}/${parsed.pageCount}`);
      expect(page).toContain("LONACI");
    }
  });
});
