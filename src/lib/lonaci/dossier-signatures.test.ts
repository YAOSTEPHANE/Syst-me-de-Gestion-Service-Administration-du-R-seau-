import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  appendAuditLogMock,
  createIndexesMock,
  findDossierByIdMock,
  findOneMock,
  promoteSignedDossierClientMock,
  updateOneMock,
} = vi.hoisted(() => ({
  appendAuditLogMock: vi.fn(),
  createIndexesMock: vi.fn(),
  findDossierByIdMock: vi.fn(),
  findOneMock: vi.fn(),
  promoteSignedDossierClientMock: vi.fn(),
  updateOneMock: vi.fn(),
}));

vi.mock("@/lib/lonaci/audit", () => ({
  appendAuditLog: appendAuditLogMock,
}));

vi.mock("@/lib/lonaci/client-to-concessionnaire", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/lonaci/client-to-concessionnaire")>();
  return {
    ...actual,
    promoteSignedDossierClient: promoteSignedDossierClientMock,
  };
});

vi.mock("@/lib/lonaci/dossiers", () => ({
  findDossierById: findDossierByIdMock,
}));

vi.mock("@/lib/mongodb", () => ({
  getDatabase: vi.fn().mockResolvedValue({
    collection: () => ({
      createIndexes: createIndexesMock,
      findOne: findOneMock,
      updateOne: updateOneMock,
    }),
  }),
}));

vi.mock("@/lib/env", () => ({
  env: { jwtSecret: "test-secret" },
}));

import { signDossierByToken } from "@/lib/lonaci/dossier-signatures";

const dossierId = "507f1f77bcf86cd799439011";
const clientId = "507f1f77bcf86cd799439012";
const agenceId = "507f1f77bcf86cd799439013";
const actorId = "507f1f77bcf86cd799439014";
const concessionnaireId = "507f1f77bcf86cd799439015";
const signatureId = { toHexString: () => "507f1f77bcf86cd799439016" };

function pendingSignature() {
  return {
    _id: signatureId,
    dossierId,
    tokenHash: "hash",
    status: "PENDING",
    createdByUserId: actorId,
    createdAt: new Date("2026-07-20T10:00:00.000Z"),
    expiresAt: new Date("2099-07-20T10:00:00.000Z"),
    signedAt: null,
    signerName: null,
    signerIp: null,
    signerUserAgent: null,
  };
}

describe("signDossierByToken avec promotion client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createIndexesMock.mockResolvedValue([]);
    findOneMock.mockResolvedValue(pendingSignature());
    findDossierByIdMock.mockResolvedValue({
      _id: dossierId,
      reference: "DOS-00000001",
      type: "CONTRAT_ACTUALISATION",
      status: "VALIDE_N2",
      lonaciClientId: clientId,
      concessionnaireId: null,
      agenceId,
      payload: {},
      deletedAt: null,
    });
    promoteSignedDossierClientMock.mockResolvedValue({
      concessionnaire: { _id: concessionnaireId },
      created: true,
    });
    updateOneMock.mockResolvedValue({ modifiedCount: 1 });
    appendAuditLogMock.mockResolvedValue(undefined);
  });

  it("promeut avant d'écrire SIGNED et retourne le résultat de promotion", async () => {
    const result = await signDossierByToken({
      token: "token-public",
      signerName: "Awa Koné",
      signerIp: "127.0.0.1",
      signerUserAgent: "vitest",
    });

    expect(promoteSignedDossierClientMock).toHaveBeenCalledWith({
      sourceLonaciClientId: clientId,
      dossierAgenceId: agenceId,
      actorUserId: actorId,
      gps: null,
      commune: null,
      quartier: null,
      statutBancarisation: undefined,
      compteBancaire: null,
    });
    expect(
      promoteSignedDossierClientMock.mock.invocationCallOrder[0],
    ).toBeLessThan(updateOneMock.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER);
    expect(updateOneMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "PENDING" }),
      expect.objectContaining({
        $set: expect.objectContaining({
          status: "SIGNED",
          concessionnaireId,
          concessionnaireCreated: true,
        }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        dossierId,
        concessionnaireId,
        concessionnaireCreated: true,
      }),
    );
  });

  it("transmet GPS et bancarisation du payload dossier à la promotion", async () => {
    findDossierByIdMock.mockResolvedValue({
      _id: dossierId,
      reference: "DOS-00000001",
      type: "CONTRAT_ACTUALISATION",
      status: "VALIDE_N2",
      lonaciClientId: clientId,
      concessionnaireId: null,
      agenceId,
      payload: {
        gps: { lat: 5.36, lng: -4.01 },
        commune: "Cocody",
        quartier: "Angré",
        statutBancarisation: "BANCARISE",
        compteBancaire: "CI00 1234",
      },
      deletedAt: null,
    });

    await signDossierByToken({
      token: "token-public",
      signerName: "Awa Koné",
      signerIp: "127.0.0.1",
      signerUserAgent: "vitest",
    });

    expect(promoteSignedDossierClientMock).toHaveBeenCalledWith({
      sourceLonaciClientId: clientId,
      dossierAgenceId: agenceId,
      actorUserId: actorId,
      gps: { lat: 5.36, lng: -4.01 },
      commune: "Cocody",
      quartier: "Angré",
      statutBancarisation: "BANCARISE",
      compteBancaire: "CI00 1234",
    });
  });

  it("ne marque pas la signature si la promotion échoue", async () => {
    promoteSignedDossierClientMock.mockRejectedValue(new Error("AGENCE_INACTIVE"));

    await expect(
      signDossierByToken({
        token: "token-public",
        signerName: "Awa Koné",
        signerIp: null,
        signerUserAgent: null,
      }),
    ).rejects.toThrow("AGENCE_INACTIVE");
    expect(updateOneMock).not.toHaveBeenCalled();
    expect(appendAuditLogMock).not.toHaveBeenCalled();
  });

  it("relit et retourne l'état SIGNED lorsqu'une requête concurrente gagne", async () => {
    const signedAt = new Date("2026-07-21T10:00:00.000Z");
    findOneMock
      .mockResolvedValueOnce(pendingSignature())
      .mockResolvedValueOnce({
        ...pendingSignature(),
        status: "SIGNED",
        signedAt,
        signerName: "Autre signataire",
        concessionnaireId,
        concessionnaireCreated: false,
      });
    updateOneMock.mockResolvedValue({ modifiedCount: 0 });

    const result = await signDossierByToken({
      token: "token-public",
      signerName: "Awa Koné",
      signerIp: null,
      signerUserAgent: null,
    });

    expect(result).toEqual(
      expect.objectContaining({
        signedAt,
        signerName: "Autre signataire",
        concessionnaireId,
        concessionnaireCreated: false,
      }),
    );
    expect(appendAuditLogMock).not.toHaveBeenCalled();
  });
});
