import { describe, expect, it } from "vitest";

import {
  parseContratsGeneresPayload,
  referenceAnnexeFromContrat,
  summarizeContratsParProduit,
} from "@/lib/lonaci/contrat-document";

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
