import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";

import {
  parseContratsGeneresPayload,
  referenceAnnexeFromContrat,
  renderAnnexeDocumentPdf,
  renderContratDocumentPdf,
  summarizeContratsParProduit,
  type AnnexeDocumentView,
  type ContratDocumentView,
} from "@/lib/lonaci/contrat-document";

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

function createContratView(): ContratDocumentView {
  return {
    dossierReference: "DOS-2026-0042",
    contratReference: "CONTRAT-LOTO-2026-07-0001",
    generatedAt: new Date("2026-07-21T08:00:00.000Z"),
    dateEffet: new Date("2026-08-01T09:30:00.000Z"),
    operationType: "NOUVEAU",
    produitCode: "LOTO",
    produitLibelle: "Loto",
    paymentReference: "PAY-2026-00042",
    cautionReferenceLabel: "CAU-2026-00042",
    concessionnaire: {
      partyKind: "client",
      nomComplet: "Awa Koné",
      raisonSociale: "Établissements Awa",
      codePdv: "CLI-0042",
      codeTerminal: "T-42",
      codeConcessionnaire: null,
      cniNumero: "CI012345",
      email: "awa@example.ci",
      telephone: "+225 01 02 03 04 05",
      adresse: "42 avenue de la Paix",
      ville: "Abidjan",
      codePostal: "01 BP 100",
      agenceLabel: "ABJ-01 — Agence Abobo (Abidjan)",
      categorie: "PERSONNE_PHYSIQUE",
      categorieLabel: "Personne physique",
      codeMachine: "T-42",
      nomContact: "Awa Koné",
      typeDistributeur: "NOUVEAU",
      typeDistributeurLabel: "Nouveau",
      nombreTpm: 2,
      numeroDistributeur: "DIST-100",
      numeroTpm: "TPM-200",
      notes: null,
      produitsAutorises: ["LOTO"],
    },
    documentsFournis: Array.from(
      { length: 58 },
      (_, index) => `Pièce métier fournie numéro ${index + 1}`,
    ),
    documentsAnnexeAssocies: ["Plan de localisation", "Attestation complémentaire"],
    signedAt: new Date("2026-07-21T08:30:00.000Z"),
    signerName: "Chef de Service",
    finalized: true,
  };
}

describe("referenceAnnexeFromContrat", () => {
  it("dérive la référence annexe depuis le contrat", () => {
    expect(referenceAnnexeFromContrat("CONTRAT-LOTO-2026-07-0001")).toBe("ANNEXE-LOTO-2026-07-0001");
  });
});

describe("parseContratsGeneresPayload", () => {
  it("parse contratsGeneres avec annexe", () => {
    const list = parseContratsGeneresPayload({
      contratsGeneres: [
        {
          generatedAt: "2026-07-01T00:00:00.000Z",
          generatedByUserId: "u1",
          dechargeDefinitiveValideeLe: "2026-07-01T00:00:00.000Z",
          referenceContratPreview: "CONTRAT-LOTO-2026-07-0001",
          referenceAnnexePreview: "ANNEXE-LOTO-2026-07-0001",
          paymentReference: "PAY-1",
          cautionReferenceLabel: "CAU-1",
          produitCode: "LOTO",
          produitLibelle: "Loto",
          operationType: "NOUVEAU",
          dateEffet: "2026-07-01T00:00:00.000Z",
          concessionnaire: {
            nomComplet: "Test",
            raisonSociale: "Test SARL",
            codePdv: "PDV1",
            codeTerminal: null,
            codeConcessionnaire: null,
            cniNumero: null,
            email: null,
            telephone: null,
            adresse: null,
            ville: null,
            codePostal: null,
            agenceLabel: "Agence",
          },
        },
      ],
    });
    expect(list).toHaveLength(1);
    expect(list[0]?.referenceAnnexePreview).toBe("ANNEXE-LOTO-2026-07-0001");
  });
});

describe("summarizeContratsParProduit", () => {
  it("résume contrat et annexe par produit", () => {
    const rows = summarizeContratsParProduit({
      contratsGeneres: [
        {
          generatedAt: "2026-07-01T00:00:00.000Z",
          generatedByUserId: "u1",
          dechargeDefinitiveValideeLe: "2026-07-01T00:00:00.000Z",
          referenceContratPreview: "CONTRAT-PMU-2026-07-0002",
          referenceAnnexePreview: "ANNEXE-PMU-2026-07-0002",
          paymentReference: "PAY-2",
          cautionReferenceLabel: "CAU-2",
          produitCode: "PMU",
          produitLibelle: "PMU",
          operationType: "NOUVEAU",
          dateEffet: "2026-07-01T00:00:00.000Z",
          concessionnaire: {
            nomComplet: "Test",
            raisonSociale: "Test SARL",
            codePdv: "PDV1",
            codeTerminal: null,
            codeConcessionnaire: null,
            cniNumero: null,
            email: null,
            telephone: null,
            adresse: null,
            ville: null,
            codePostal: null,
            agenceLabel: "Agence",
          },
          contratSigneArchive: { storedRelativePath: "a.pdf", archivedAt: "x", contratReference: "C1" },
          annexeSigneArchive: { storedRelativePath: "b.pdf", archivedAt: "x", annexeReference: "A1" },
        },
      ],
    });
    expect(rows[0]).toMatchObject({
      produitCode: "PMU",
      contratArchive: true,
      annexeArchive: true,
    });
  });
});

describe("rendus PDF contrat et annexe", () => {
  it("préserve le contenu métier du contrat sur plusieurs pages", async () => {
    const parsed = await readPdf(await renderContratDocumentPdf(createContratView()));
    const text = parsed.pages.join(" ");

    expect(parsed.pageCount).toBeGreaterThan(1);
    expect(text).toContain("CONTRAT DE CONCESSION");
    expect(text).toContain("CONTRAT SIGNÉ ET ARCHIVÉ");
    expect(text).toContain("CONTRAT-LOTO-2026-07-0001");
    expect(text).toContain("PAY-2026-00042");
    expect(text).toContain("Signature électronique");
    expect(text).toContain("Chef de Service");
    expect(text).toContain("Pièce métier fournie numéro 58");
    expect(text).toContain("Agence (Intérieur - Abidjan)");
    expect(text).toContain("Abobo");
    expect(text).toContain("Type de distributeur");
    expect(text).toContain("Nouveau");
    expect(text).toContain("Nombre de TPM");
    expect(text).toContain("N° Distributeur");
    expect(text).toContain("DIST-100");
    expect(text).toContain("N° TPM");
    expect(text).toContain("TPM-200");
    for (const [index, page] of parsed.pages.entries()) {
      expect(page).toContain(`Page ${index + 1}/${parsed.pageCount}`);
    }
  });

  it("préserve les références et le comportement brouillon de l’annexe", async () => {
    const contrat = createContratView();
    const annexe: AnnexeDocumentView = {
      ...contrat,
      finalized: false,
      signedAt: null,
      signerName: null,
      annexeReference: "ANNEXE-LOTO-2026-07-0001",
      contratParentReference: contrat.contratReference,
    };
    const parsed = await readPdf(await renderAnnexeDocumentPdf(annexe));
    const text = parsed.pages.join(" ");

    expect(text).toContain("ANNEXE AU CONTRAT DE CONCESSION");
    expect(text).toContain("PROJET D’ANNEXE");
    expect(text).toContain("ANNEXE-LOTO-2026-07-0001");
    expect(text).toContain("CONTRAT-LOTO-2026-07-0001");
    expect(text).toContain("Cette annexe accompagne le contrat");
    for (const [index, page] of parsed.pages.entries()) {
      expect(page).toContain(`Page ${index + 1}/${parsed.pageCount}`);
    }
  });
});
