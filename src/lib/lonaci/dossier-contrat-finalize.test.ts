import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  findDossierByIdMock,
  findContratByDossierIdMock,
  findContratsByDossierIdMock,
  parseContratGenerePayloadMock,
  parseContratsGeneresPayloadMock,
  prepareContratMock,
  ensureReadyMock,
  hasActiveMock,
  finalizeContratMock,
  archiveMock,
  archiveAnnexeMock,
  transitionDossierMock,
} = vi.hoisted(() => ({
  findDossierByIdMock: vi.fn(),
  findContratByDossierIdMock: vi.fn(),
  findContratsByDossierIdMock: vi.fn(),
  parseContratGenerePayloadMock: vi.fn(),
  parseContratsGeneresPayloadMock: vi.fn(),
  prepareContratMock: vi.fn(),
  ensureReadyMock: vi.fn(),
  hasActiveMock: vi.fn(),
  finalizeContratMock: vi.fn(),
  archiveMock: vi.fn(),
  archiveAnnexeMock: vi.fn(),
  transitionDossierMock: vi.fn(),
}));

vi.mock("@/lib/lonaci/dossiers", () => ({
  findDossierById: findDossierByIdMock,
  transitionDossier: transitionDossierMock,
}));

vi.mock("@/lib/lonaci/contracts", () => ({
  findContratByDossierId: findContratByDossierIdMock,
  findContratsByDossierId: findContratsByDossierIdMock,
  hasActiveContractForParty: hasActiveMock,
  finalizeContratFromDossier: finalizeContratMock,
}));

vi.mock("@/lib/lonaci/contrat-document", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/lonaci/contrat-document")>();
  return {
    ...actual,
    parseContratGenerePayload: parseContratGenerePayloadMock,
    parseContratsGeneresPayload: parseContratsGeneresPayloadMock,
    prepareContratFromDechargeDefinitive: prepareContratMock,
    ensureContratFinalizationReady: ensureReadyMock,
    archiveContratSigneForDossier: archiveMock,
    archiveAnnexeSigneForDossier: archiveAnnexeMock,
  };
});

import { finalizeDossierContratActualisation } from "@/lib/lonaci/dossier-contrat-finalize";
import type { UserDocument } from "@/lib/lonaci/types";

const actor = { _id: "u1", role: "CHEF_SERVICE" } as UserDocument;

const baseDossier = {
  _id: "d1",
  deletedAt: null,
  status: "VALIDE_N2",
  type: "CONTRAT_ACTUALISATION",
  concessionnaireId: "c1",
  payload: {
    produitCode: "LOTO",
    produitCodes: ["LOTO"],
    operationType: "NOUVEAU",
    dateEffet: new Date().toISOString(),
    contratGenere: { snapshot: true },
  },
};

describe("finalizeDossierContratActualisation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findDossierByIdMock.mockImplementation(async () => ({ ...baseDossier }));
    findContratByDossierIdMock.mockResolvedValue(null);
    findContratsByDossierIdMock.mockResolvedValue([]);
    parseContratGenerePayloadMock.mockReturnValue({ snapshot: true });
    parseContratsGeneresPayloadMock.mockReturnValue([{ snapshot: true, produitCode: "LOTO" }]);
    prepareContratMock.mockResolvedValue(undefined);
    ensureReadyMock.mockResolvedValue(undefined);
    hasActiveMock.mockResolvedValue(false);
    finalizeContratMock.mockResolvedValue({ id: "ct1", reference: "REF-1" });
    archiveMock.mockResolvedValue(undefined);
    archiveAnnexeMock.mockResolvedValue(undefined);
    transitionDossierMock.mockResolvedValue({});
  });

  it("crée le contrat avant la transition FINALISE", async () => {
    const order: string[] = [];
    finalizeContratMock.mockImplementation(async () => {
      order.push("contrat");
      return { id: "ct1", reference: "REF-1" };
    });
    archiveMock.mockImplementation(async () => {
      order.push("archive-contrat");
    });
    archiveAnnexeMock.mockImplementation(async () => {
      order.push("archive-annexe");
    });
    transitionDossierMock.mockImplementation(async () => {
      order.push("transition");
      return {};
    });

    const result = await finalizeDossierContratActualisation({
      dossierId: "d1",
      actor,
    });

    expect(result.ok).toBe(true);
    expect(order).toEqual(["contrat", "archive-contrat", "archive-annexe", "transition"]);
  });

  it("ne finalise pas le dossier si la création du contrat échoue", async () => {
    finalizeContratMock.mockRejectedValue(new Error("ACTIVE_CONTRACT_EXISTS"));

    const result = await finalizeDossierContratActualisation({
      dossierId: "d1",
      actor,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("ACTIVE_CONTRACT_EXISTS");
    }
    expect(transitionDossierMock).not.toHaveBeenCalled();
  });

  it("finalise le dossier lorsqu’un contrat existe déjà", async () => {
    findContratsByDossierIdMock.mockResolvedValue([
      { id: "ct1", reference: "REF-1", produitCode: "LOTO" },
    ]);
    transitionDossierMock.mockResolvedValue({ ...baseDossier, status: "FINALISE" });

    const result = await finalizeDossierContratActualisation({
      dossierId: "d1",
      actor,
    });

    expect(result.ok).toBe(true);
    expect(transitionDossierMock).toHaveBeenCalledWith("d1", "FINALISE", actor, null);
    if (result.ok) {
      expect(result.dossier.status).toBe("FINALISE");
      expect(result.alreadyHadContrat).toBe(true);
    }
  });
});
