import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  appendAuditLogMock,
  createConcessionnaireMock,
  findAgenceByIdMock,
  findConcessionnaireByIdMock,
  findLonaciClientByIdMock,
  findUserByIdMock,
  listProduitsMock,
  lockDeleteOneMock,
  lockUpdateOneMock,
  prismaClientUpdateMock,
  prismaConcessionnaireFindFirstMock,
} = vi.hoisted(() => ({
  appendAuditLogMock: vi.fn(),
  createConcessionnaireMock: vi.fn(),
  findAgenceByIdMock: vi.fn(),
  findConcessionnaireByIdMock: vi.fn(),
  findLonaciClientByIdMock: vi.fn(),
  findUserByIdMock: vi.fn(),
  listProduitsMock: vi.fn(),
  lockDeleteOneMock: vi.fn(),
  lockUpdateOneMock: vi.fn(),
  prismaClientUpdateMock: vi.fn(),
  prismaConcessionnaireFindFirstMock: vi.fn(),
}));

vi.mock("@/lib/lonaci/audit", () => ({
  appendAuditLog: appendAuditLogMock,
}));

vi.mock("@/lib/lonaci/clients", () => ({
  findLonaciClientById: findLonaciClientByIdMock,
  parseClientDocumentChecklist: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/lonaci/concessionnaires", () => ({
  createConcessionnaire: createConcessionnaireMock,
  findConcessionnaireById: findConcessionnaireByIdMock,
}));

vi.mock("@/lib/lonaci/concessionnaire-inscription", () => ({
  buildInscriptionChecklistForProducts: vi
    .fn()
    .mockReturnValue({ entries: [], complet: true }),
}));

vi.mock("@/lib/lonaci/referentials", () => ({
  findAgenceById: findAgenceByIdMock,
  listProduits: listProduitsMock,
}));

vi.mock("@/lib/lonaci/users", () => ({
  findUserById: findUserByIdMock,
}));

vi.mock("@/lib/mongodb", () => ({
  getDatabase: vi.fn().mockResolvedValue({
    collection: () => ({
      updateOne: lockUpdateOneMock,
      deleteOne: lockDeleteOneMock,
    }),
  }),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    concessionnaire: {
      findFirst: prismaConcessionnaireFindFirstMock,
    },
    lonaciClient: {
      update: prismaClientUpdateMock,
    },
  },
}));

import {
  createConcessionnaireFromClient,
  promoteSignedDossierClient,
} from "@/lib/lonaci/client-to-concessionnaire";

const clientId = "507f1f77bcf86cd799439011";
const agenceId = "507f1f77bcf86cd799439012";
const concessionnaireId = "507f1f77bcf86cd799439013";
const actorId = "507f1f77bcf86cd799439014";

function clientWithStatut(statut: string, clientAgenceId: string | null = agenceId) {
  return {
    id: clientId,
    code: "CLI-001",
    statut,
    agenceId: clientAgenceId,
    nomComplet: "Awa Koné",
    raisonSociale: "Awa Koné",
    cniNumero: "CNI-1",
    email: "awa@example.test",
    telephone: "0102030405",
    adresse: "Abidjan",
    ville: "Abidjan",
    codePostal: null,
    produitsAutorises: ["LOTO"],
    documentChecklist: null,
    notes: null,
  };
}

const actor = {
  _id: actorId,
  actif: true,
  role: "AGENT",
};

const createdConcessionnaire = {
  _id: concessionnaireId,
  sourceLonaciClientId: clientId,
  inscriptionStatut: "DOSSIER_EN_COURS",
  statut: "INACTIF",
  codePdv: null,
  gps: null,
};

describe("promotion concessionnaire après signature", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaConcessionnaireFindFirstMock.mockResolvedValue(null);
    lockUpdateOneMock.mockResolvedValue({ matchedCount: 0, upsertedCount: 1 });
    lockDeleteOneMock.mockResolvedValue({ deletedCount: 1 });
    listProduitsMock.mockResolvedValue([]);
    findAgenceByIdMock.mockResolvedValue({
      _id: agenceId,
      code: "ABJ",
      actif: true,
    });
    findUserByIdMock.mockResolvedValue(actor);
    createConcessionnaireMock.mockResolvedValue(createdConcessionnaire);
    prismaClientUpdateMock.mockResolvedValue(clientWithStatut("INACTIF"));
    appendAuditLogMock.mockResolvedValue(undefined);
  });

  it("crée une fiche inactive dans le parcours normal avec GPS null", async () => {
    findLonaciClientByIdMock.mockResolvedValue(clientWithStatut("DOSSIER_EN_COURS"));

    const result = await promoteSignedDossierClient({
      sourceLonaciClientId: clientId,
      dossierAgenceId: agenceId,
      actorUserId: actorId,
    });

    expect(result).toEqual({
      concessionnaire: createdConcessionnaire,
      created: true,
    });
    expect(createConcessionnaireMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceLonaciClientId: clientId,
        agenceId,
        agenceCode: "ABJ",
        gps: null,
        createdByUserId: actorId,
      }),
    );
    expect(createConcessionnaireMock.mock.calls[0]?.[0]).not.toHaveProperty(
      "skipInscriptionWorkflow",
    );
  });

  it("retourne le concessionnaire existant sans recréer ni valider le statut", async () => {
    prismaConcessionnaireFindFirstMock.mockResolvedValue({ id: concessionnaireId });
    findConcessionnaireByIdMock.mockResolvedValue(createdConcessionnaire);

    const result = await promoteSignedDossierClient({
      sourceLonaciClientId: clientId,
      dossierAgenceId: agenceId,
      actorUserId: actorId,
    });

    expect(result).toEqual({
      concessionnaire: createdConcessionnaire,
      created: false,
    });
    expect(findLonaciClientByIdMock).not.toHaveBeenCalled();
    expect(createConcessionnaireMock).not.toHaveBeenCalled();
    expect(lockUpdateOneMock).not.toHaveBeenCalled();
  });

  it("bloque une seconde promotion concurrente sans créer de doublon", async () => {
    lockUpdateOneMock.mockRejectedValue({ code: 11000 });

    await expect(
      promoteSignedDossierClient({
        sourceLonaciClientId: clientId,
        dossierAgenceId: agenceId,
        actorUserId: actorId,
      }),
    ).rejects.toThrow("CLIENT_PROMOTION_IN_PROGRESS");
    expect(createConcessionnaireMock).not.toHaveBeenCalled();
    expect(lockDeleteOneMock).not.toHaveBeenCalled();
  });

  it.each(["EN_ATTENTE_N1", "REJETE"])(
    "refuse le statut %s comme inscription non validée",
    async (statut) => {
      findLonaciClientByIdMock.mockResolvedValue(clientWithStatut(statut));

      await expect(
        promoteSignedDossierClient({
          sourceLonaciClientId: clientId,
          dossierAgenceId: agenceId,
          actorUserId: actorId,
        }),
      ).rejects.toThrow("CLIENT_INSCRIPTION_PENDING");
      expect(createConcessionnaireMock).not.toHaveBeenCalled();
    },
  );

  it("refuse un client inactif", async () => {
    findLonaciClientByIdMock.mockResolvedValue(clientWithStatut("INACTIF"));

    await expect(
      promoteSignedDossierClient({
        sourceLonaciClientId: clientId,
        dossierAgenceId: agenceId,
        actorUserId: actorId,
      }),
    ).rejects.toThrow("CLIENT_BLOQUE");
  });

  it("refuse une agence absente, invalide ou inactive", async () => {
    findLonaciClientByIdMock.mockResolvedValue(clientWithStatut("ACTIF"));
    findAgenceByIdMock.mockResolvedValueOnce(null);

    await expect(
      promoteSignedDossierClient({
        sourceLonaciClientId: clientId,
        dossierAgenceId: agenceId,
        actorUserId: actorId,
      }),
    ).rejects.toThrow("AGENCE_INVALID");

    findAgenceByIdMock.mockResolvedValueOnce({ code: "ABJ", actif: false });
    await expect(
      promoteSignedDossierClient({
        sourceLonaciClientId: clientId,
        dossierAgenceId: agenceId,
        actorUserId: actorId,
      }),
    ).rejects.toThrow("AGENCE_INACTIVE");
  });

  it("refuse une promotion sans agence rattachée", async () => {
    findLonaciClientByIdMock.mockResolvedValue(clientWithStatut("ACTIF", null));

    await expect(
      promoteSignedDossierClient({
        sourceLonaciClientId: clientId,
        dossierAgenceId: null,
        actorUserId: actorId,
      }),
    ).rejects.toThrow("AGENCE_REQUIRED");
  });

  it("refuse un acteur serveur absent", async () => {
    findLonaciClientByIdMock.mockResolvedValue(clientWithStatut("ACTIF"));
    findUserByIdMock.mockResolvedValue(null);

    await expect(
      promoteSignedDossierClient({
        sourceLonaciClientId: clientId,
        dossierAgenceId: agenceId,
        actorUserId: actorId,
      }),
    ).rejects.toThrow("SIGN_ACTOR_NOT_FOUND");
    expect(createConcessionnaireMock).not.toHaveBeenCalled();
  });

  it("conserve les règles strictes du flux manuel", async () => {
    findLonaciClientByIdMock.mockResolvedValue(clientWithStatut("DOSSIER_EN_COURS"));

    await expect(
      createConcessionnaireFromClient({
        sourceLonaciClientId: clientId,
        agenceCode: "ABJ",
        agenceId,
        gps: { lat: 5.3, lng: -4 },
        actor: actor as never,
      }),
    ).rejects.toThrow("CLIENT_PARCOURS_INCOMPLET");
  });
});
