import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it, vi } from "vitest";

import type { CessionExportMeta, CessionExportRow } from "@/lib/lonaci/cessions-export";
import type { GrattageContratListItem } from "@/lib/lonaci/grattage-contrats";
import type { DossierDocument } from "@/lib/lonaci/types";

vi.mock("server-only", () => ({}));

import { renderCessionsListPdf } from "./cessions-list";
import { renderContratRecapitulatifPdf } from "./contrat-recapitulatif";
import { renderGrattageContratsPdf } from "./grattage-contrats";
import { renderResiliationsListPdf, type ResiliationPdfRow } from "./resiliations-list";
import { renderSuccessionsListPdf, type SuccessionPdfRow } from "./successions-list";

interface ParsedPdf {
  pageCount: number;
  pages: string[];
}

async function readPdf(buffer: Buffer): Promise<ParsedPdf> {
  expect(buffer.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  const task = getDocument({ data: new Uint8Array(buffer), useSystemFonts: true });
  const pdf = await task.promise;
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

const issuedAt = new Date("2026-07-21T09:00:00.000Z");

function assertPremiumChrome(parsed: ParsedPdf): void {
  expect(parsed.pageCount).toBeGreaterThanOrEqual(1);
  parsed.pages.forEach((page, index) => {
    expect(page).toContain("LONACI");
    expect(page).toContain(`Page ${index + 1}/${parsed.pageCount}`);
  });
}

describe("exports PDF premium", () => {
  it("produit des listes PDF réelles avec toutes leurs données métier", async () => {
    const cessionMeta: CessionExportMeta = {
      generatedAt: issuedAt.toISOString(),
      filtersSummary: "Type : Demandes de cession · Agence : Plateau",
      total: 1,
      kind: "CESSION",
    };
    const cessions: CessionExportRow[] = [
      {
        reference: "CES-001",
        cedantLabel: "Cédant Alpha",
        cessionnaireLabel: "Bénéficiaire Beta",
        dateDemande: "21/07/2026",
        statutLabel: "Validée chef de service",
        agenceLabel: "Agence Plateau",
        produitCode: "PMU",
      },
    ];
    const grattage: GrattageContratListItem[] = [
      {
        id: "g1",
        reference: "CGR-0000001",
        concessionnaireId: "c1",
        codePdv: "PDV-001",
        raisonSociale: "Distribution Ivoire",
        agenceId: "Agence Cocody",
        produitCode: "LOTO",
        statut: "EN_COURS",
        statutLabel: "En cours",
        dateDebut: issuedAt.toISOString(),
        dateFin: null,
        gprRegistrationId: "gpr1",
        createdAt: issuedAt.toISOString(),
        updatedAt: issuedAt.toISOString(),
      },
    ];
    const resiliations: ResiliationPdfRow[] = [
      {
        id: "RES-001",
        concessionnaireId: "c2",
        produitCode: "PMU",
        dateReception: issuedAt.toISOString(),
        statutLabel: "Résilié",
        motif: "Fin d’activité",
        commentaire: "Dossier complet",
        validatedAt: issuedAt.toISOString(),
      },
    ];
    const successions: SuccessionPdfRow[] = [
      {
        reference: "SUC-001",
        concessionnaireId: "c3",
        statutMetierLabel: "Décision enregistrée",
        stepsCompleted: 5,
        stepsTotal: 5,
        decisionType: "TRANSFERT",
        autoDossierContratReference: "DOS-AUTO-001",
        updatedAt: issuedAt.toISOString(),
      },
    ];

    const documents = [
      { parsed: await readPdf(await renderCessionsListPdf(cessionMeta, cessions)), marker: "CES-001" },
      {
        parsed: await readPdf(await renderGrattageContratsPdf(grattage, issuedAt)),
        marker: "CGR-0000001",
      },
      {
        parsed: await readPdf(await renderResiliationsListPdf(resiliations, issuedAt)),
        marker: "RES-001",
      },
      {
        parsed: await readPdf(await renderSuccessionsListPdf(successions, issuedAt)),
        marker: "DOS-AUTO-001",
      },
    ];

    for (const { parsed, marker } of documents) {
      assertPremiumChrome(parsed);
      expect(parsed.pages.join(" ")).toContain(marker);
    }
  });

  it("pagine les tableaux et conserve la dernière ligne", async () => {
    const rows: ResiliationPdfRow[] = Array.from({ length: 90 }, (_, index) => ({
      id: `RES-${String(index + 1).padStart(3, "0")}`,
      concessionnaireId: `CONC-${index + 1}`,
      produitCode: "LOTO",
      dateReception: issuedAt.toISOString(),
      statutLabel: "Contrôle chef de section",
      motif: `Motif institutionnel ${index + 1}`,
      commentaire: `Commentaire de suivi ${index + 1}`,
      validatedAt: null,
    }));
    const parsed = await readPdf(await renderResiliationsListPdf(rows, issuedAt));
    expect(parsed.pageCount).toBeGreaterThan(1);
    expect(parsed.pages.join(" ")).toContain("RES-090");
    assertPremiumChrome(parsed);
  });

  it("structure le récapitulatif en cartes, sections et historique paginé", async () => {
    const dossier: DossierDocument = {
      _id: "d1",
      type: "CONTRAT_ACTUALISATION",
      reference: "DOS-RECAP-001",
      status: "VALIDE_N1",
      concessionnaireId: "conc-1",
      lonaciClientId: "client-1",
      agenceId: "agence-1",
      payload: {
        produitCode: "PMU",
        operationType: "NOUVEAU",
        dateOperation: "2026-07-21",
        observations: "Ouverture du point de vente",
      },
      history: Array.from({ length: 70 }, (_, index) => ({
        status: "VALIDE_N1",
        actedByUserId: `agent-${index + 1}`,
        actedAt: issuedAt,
        comment: `Validation historique ${index + 1}`,
      })),
      createdByUserId: "agent-1",
      updatedByUserId: "agent-70",
      createdAt: issuedAt,
      updatedAt: issuedAt,
      deletedAt: null,
    };
    const parsed = await readPdf(await renderContratRecapitulatifPdf(dossier, issuedAt));
    expect(parsed.pageCount).toBeGreaterThan(1);
    const text = parsed.pages.join(" ");
    expect(text).toContain("Identification");
    expect(text).toContain("Opération contractuelle");
    expect(text).toContain("Validation historique 70");
    assertPremiumChrome(parsed);
  });
});
