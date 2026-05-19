import { describe, expect, it } from "vitest";

import { resolveSuccessionStatutMetier } from "@/lib/lonaci/succession-statut-metier";

const baseHistory = [{ step: "DECLARATION_DECES" as const }];

describe("resolveSuccessionStatutMetier §10.3", () => {
  it("retourne DÉCLARÉ en constitution initiale", () => {
    expect(
      resolveSuccessionStatutMetier({
        status: "OUVERT",
        stepHistory: baseHistory,
        checklistComplet: false,
      }),
    ).toBe("DECLARE");
  });

  it("retourne DOSSIER COMPLET après checklist et N1/N2", () => {
    expect(
      resolveSuccessionStatutMetier({
        status: "OUVERT",
        stepHistory: [...baseHistory, { step: "IDENTIFICATION_AYANT_DROIT" }, { step: "PIECES_JUSTIFICATIVES" }],
        checklistComplet: true,
        validationN1At: "2025-01-10",
        validationN2At: "2025-01-11",
      }),
    ).toBe("DOSSIER_COMPLET");
  });

  it("retourne EN INSTRUCTION après validation juridique OHADA", () => {
    expect(
      resolveSuccessionStatutMetier({
        status: "OUVERT",
        stepHistory: [
          ...baseHistory,
          { step: "IDENTIFICATION_AYANT_DROIT" },
          { step: "PIECES_JUSTIFICATIVES" },
          { step: "VERIFICATION_JURIDIQUE" },
        ],
        checklistComplet: true,
        validationN1At: "2025-01-10",
        validationN2At: "2025-01-11",
        currentStepLabel: "DECISION",
      }),
    ).toBe("EN_INSTRUCTION");
  });

  it("retourne TRANSFERT EFFECTUÉ ou RÉSILIÉ selon la décision", () => {
    expect(
      resolveSuccessionStatutMetier({
        status: "CLOTURE",
        decisionType: "TRANSFERT",
        stepHistory: [
          ...baseHistory,
          { step: "IDENTIFICATION_AYANT_DROIT" },
          { step: "PIECES_JUSTIFICATIVES" },
          { step: "VERIFICATION_JURIDIQUE" },
          { step: "DECISION" },
        ],
        checklistComplet: true,
      }),
    ).toBe("TRANSFERT_EFFECTUE");

    expect(
      resolveSuccessionStatutMetier({
        status: "CLOTURE",
        decisionType: "RESILIATION",
        stepHistory: [
          ...baseHistory,
          { step: "IDENTIFICATION_AYANT_DROIT" },
          { step: "PIECES_JUSTIFICATIVES" },
          { step: "VERIFICATION_JURIDIQUE" },
          { step: "DECISION" },
        ],
      }),
    ).toBe("RESILIE");
  });
});
