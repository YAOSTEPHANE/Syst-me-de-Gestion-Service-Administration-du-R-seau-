import { beforeEach, describe, expect, it, vi } from "vitest";

const transitionDossierMock = vi.fn();
const finalizeMock = vi.fn();
const approvalsEnabledMock = vi.fn(() => false);

vi.mock("@/lib/lonaci/dossiers", () => ({
  transitionDossier: (...args: unknown[]) => transitionDossierMock(...args),
}));

vi.mock("@/lib/lonaci/dossier-contrat-finalize", () => ({
  finalizeDossierContratActualisation: (...args: unknown[]) => finalizeMock(...args),
}));

vi.mock("@/lib/lonaci/workflow-approvals", () => ({
  areWorkflowApprovalsEnabled: () => approvalsEnabledMock(),
}));

import { submitAndAutoValidateContratDossier } from "@/lib/lonaci/dossier-contrat-auto-validate";
import type { DossierDocument, UserDocument } from "@/lib/lonaci/types";

const actor = { _id: "u1", role: "AGENT" } as UserDocument;

function dossier(status: DossierDocument["status"]): DossierDocument {
  return {
    _id: "d1",
    type: "CONTRAT_ACTUALISATION",
    status,
    reference: "DOS-1",
    payload: {},
  } as DossierDocument;
}

describe("submitAndAutoValidateContratDossier", () => {
  beforeEach(() => {
    transitionDossierMock.mockReset();
    finalizeMock.mockReset();
    approvalsEnabledMock.mockReturnValue(false);
  });

  it("enchaîne SOUMIS → N1 → N2 puis tente la finalisation", async () => {
    transitionDossierMock
      .mockResolvedValueOnce(dossier("SOUMIS"))
      .mockResolvedValueOnce(dossier("VALIDE_N1"))
      .mockResolvedValueOnce(dossier("VALIDE_N2"));
    finalizeMock.mockResolvedValue({
      ok: false,
      code: "NOT_READY",
      message: "pas prêt",
      httpStatus: 409,
    });

    const result = await submitAndAutoValidateContratDossier({
      dossier: dossier("BROUILLON"),
      actor,
      submitComment: "test",
    });

    expect(transitionDossierMock).toHaveBeenCalledTimes(3);
    expect(transitionDossierMock.mock.calls.map((c) => c[1])).toEqual([
      "SOUMIS",
      "VALIDE_N1",
      "VALIDE_N2",
    ]);
    expect(result.submitted).toBe(true);
    expect(result.autoValidated).toBe(true);
    expect(result.finalized).toBe(false);
    expect(result.dossier.status).toBe("VALIDE_N2");
  });

  it("s’arrête à SOUMIS si les validations hiérarchiques sont actives", async () => {
    approvalsEnabledMock.mockReturnValue(true);
    transitionDossierMock.mockResolvedValueOnce(dossier("SOUMIS"));

    const result = await submitAndAutoValidateContratDossier({
      dossier: dossier("BROUILLON"),
      actor,
      submitComment: "test",
    });

    expect(transitionDossierMock).toHaveBeenCalledTimes(1);
    expect(result.autoValidated).toBe(false);
    expect(result.submitted).toBe(true);
  });

  it("marque finalized quand la finalisation réussit", async () => {
    transitionDossierMock
      .mockResolvedValueOnce(dossier("SOUMIS"))
      .mockResolvedValueOnce(dossier("VALIDE_N1"))
      .mockResolvedValueOnce(dossier("VALIDE_N2"));
    finalizeMock.mockResolvedValue({
      ok: true,
      dossier: dossier("FINALISE"),
      contrat: { id: "c1" },
      contrats: [{ id: "c1" }],
      alreadyHadContrat: false,
    });

    const result = await submitAndAutoValidateContratDossier({
      dossier: dossier("BROUILLON"),
      actor,
      submitComment: "test",
    });

    expect(result.finalized).toBe(true);
    expect(result.dossier.status).toBe("FINALISE");
  });
});
