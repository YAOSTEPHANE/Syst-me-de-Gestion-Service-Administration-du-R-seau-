import { describe, expect, it } from "vitest";

import { resolveContratStatutMetier } from "@/lib/lonaci/contrat-statut-metier";

describe("resolveContratStatutMetier", () => {
  it("priorise RESILIE sur le statut contrat", () => {
    expect(
      resolveContratStatutMetier({
        contratStatus: "RESILIE",
        dossierStatus: "FINALISE",
        checklistComplet: true,
        cautionPaid: true,
        hasDocumentChecklist: true,
      }),
    ).toBe("RESILIE");
  });

  it("retourne CONCESSIONNAIRE_ACTIF pour contrat ACTIF", () => {
    expect(
      resolveContratStatutMetier({
        contratStatus: "ACTIF",
        dossierStatus: "FINALISE",
        checklistComplet: true,
        cautionPaid: true,
      }),
    ).toBe("CONCESSIONNAIRE_ACTIF");
  });

  it("retourne CONTRAT_EN_VALIDATION pour dossier en circuit", () => {
    expect(
      resolveContratStatutMetier({
        dossierStatus: "VALIDE_N1",
        checklistComplet: true,
        cautionPaid: true,
        hasDocumentChecklist: true,
      }),
    ).toBe("CONTRAT_EN_VALIDATION");
  });

  it("retourne DOSSIER_COMPLET si checklist et caution OK", () => {
    expect(
      resolveContratStatutMetier({
        dossierStatus: "BROUILLON",
        checklistComplet: true,
        cautionPaid: true,
        hasDocumentChecklist: true,
      }),
    ).toBe("DOSSIER_COMPLET");
  });

  it("retourne DOSSIER_INCOMPLET si checklist incomplete", () => {
    expect(
      resolveContratStatutMetier({
        dossierStatus: "BROUILLON",
        checklistComplet: false,
        cautionPaid: true,
        hasDocumentChecklist: true,
      }),
    ).toBe("DOSSIER_INCOMPLET");
  });
});
