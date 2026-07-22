import { beforeEach, describe, expect, it, vi } from "vitest";

import { canRole } from "@/lib/auth/rbac";
import {
  listDossierTransitionActionsForUi,
  userCanApproveDossierAtEtape,
  userCanPerformDossierTransitionAtEtape,
} from "@/lib/auth/dossier-transition-rbac";
import {
  dossierTransitionRoleError,
  inscriptionTransitionRoleError,
  WORKFLOW_SEPARATION_ERRORS,
} from "@/lib/lonaci/workflow-separation";
import type { UserDocument } from "@/lib/lonaci/types";

const validObjectId = "507f1f77bcf86cd799439011";
const chefSection = { role: "CHEF_SECTION", _id: "chef-section-1", nom: "Dupont", prenom: "Marie" } as unknown as UserDocument;

const { getDatabaseMock, findConcessionnaireByIdMock, nextCodePdvForAgenceMock, prismaUpdateManyMock, prismaFindFirstMock, prismaUpdateMock } =
  vi.hoisted(() => ({
    getDatabaseMock: vi.fn(),
    findConcessionnaireByIdMock: vi.fn(),
    nextCodePdvForAgenceMock: vi.fn(),
    prismaUpdateManyMock: vi.fn(),
    prismaFindFirstMock: vi.fn(),
    prismaUpdateMock: vi.fn(),
  }));

vi.mock("@/lib/mongodb", () => ({
  getDatabase: getDatabaseMock,
}));

vi.mock("@/lib/lonaci/concessionnaires", () => ({
  findConcessionnaireById: findConcessionnaireByIdMock,
  nextCodePdvForAgence: nextCodePdvForAgenceMock,
}));

vi.mock("@/lib/lonaci/referentials", () => ({
  findAgenceById: vi.fn().mockResolvedValue({ code: "ABJ" }),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    concessionnaire: {
      updateMany: prismaUpdateManyMock,
    },
    lonaciClient: {
      findFirst: prismaFindFirstMock,
      update: prismaUpdateMock,
    },
  },
}));

vi.mock("@/lib/lonaci/audit", () => ({
  appendAuditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/lonaci/notifications", () => ({
  notifyRoleTargets: vi.fn().mockResolvedValue(undefined),
}));

import { transitionAgrement } from "@/lib/lonaci/agrements";
import { transitionCession } from "@/lib/lonaci/cessions";
import { transitionConcessionnaireInscription } from "@/lib/lonaci/concessionnaire-inscription";
import { validateClientCreationN1 } from "@/lib/lonaci/clients";
import { transitionGprRegistration } from "@/lib/lonaci/gpr-grattage";
import { transitionResiliation } from "@/lib/lonaci/resiliations";
import { validateCautionN1 } from "@/lib/lonaci/sprint4";
import { recordSuccessionValidationN1 } from "@/lib/lonaci/succession";

describe("Chef de section - Validation N1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("RBAC : autorise CHEF_SECTION sur CLIENTS/DOSSIERS/CAUTIONS/AGREMENTS/CESSIONS (VALIDATE_N1)", () => {
    const cases = [
      { resource: "CLIENTS", action: "VALIDATE_N1" as const },
      { resource: "DOSSIERS", action: "VALIDATE_N1" as const },
      { resource: "CAUTIONS", action: "VALIDATE_N1" as const },
      { resource: "AGREMENTS", action: "VALIDATE_N1" as const },
      { resource: "CESSIONS", action: "VALIDATE_N1" as const },
    ] as const;

    for (const c of cases) {
      const r = canRole({ role: "CHEF_SECTION", resource: c.resource, action: c.action });
      expect(r.allowed).toBe(true);
    }
  });

  it("UI dossiers : chef de section peut VALIDATE_N1 à l'étape Soumis", () => {
    expect(userCanApproveDossierAtEtape("CHEF_SECTION", "SOUMIS")).toBe(true);
    expect(userCanPerformDossierTransitionAtEtape("CHEF_SECTION", "SOUMIS", "VALIDATE_N1")).toBe(true);
    expect(listDossierTransitionActionsForUi("CHEF_SECTION", "SOUMIS")).toContain("VALIDATE_N1");
  });

  it("séparation workflow : chef de section n'est pas bloqué sur N1 dossier ni inscription PDV", () => {
    expect(dossierTransitionRoleError("CHEF_SECTION", "VALIDE_N1")).not.toBe(
      WORKFLOW_SEPARATION_ERRORS.DOSSIER_N1_CHEF_SECTION_ONLY,
    );
    expect(inscriptionTransitionRoleError("VALIDATE_N1", "CHEF_SECTION", "SOUMIS")).not.toBe(
      WORKFLOW_SEPARATION_ERRORS.INSCRIPTION_N1_CHEF_SECTION_ONLY,
    );
  });

  it("validateClientCreationN1 : chef de section passe le contrôle rôle (pas ROLE_FORBIDDEN)", async () => {
    prismaFindFirstMock.mockResolvedValue(null);

    await expect(validateClientCreationN1(validObjectId, chefSection)).rejects.toThrow("CLIENT_NOT_FOUND");
    await expect(validateClientCreationN1(validObjectId, chefSection)).rejects.not.toThrow("ROLE_FORBIDDEN");
  });

  it("validateClientCreationN1 : valide un client EN_ATTENTE_N1", async () => {
    prismaFindFirstMock.mockResolvedValue({
      id: validObjectId,
      statut: "EN_ATTENTE_N1",
      code: "ABJ-001",
      nomComplet: "Client Test",
      raisonSociale: "Client Test",
    });
    prismaUpdateMock.mockResolvedValue({
      id: validObjectId,
      statut: "DOSSIER_EN_COURS",
      code: "ABJ-001",
      nomComplet: "Client Test",
      raisonSociale: "Client Test",
    });

    const row = await validateClientCreationN1(validObjectId, chefSection);
    expect(row.statut).toBe("DOSSIER_EN_COURS");
    expect(prismaUpdateMock).toHaveBeenCalled();
  });

  it("validateCautionN1 : chef de section passe le contrôle rôle puis met la caution en VALIDE_N1", async () => {
    const cautionId = validObjectId;
    const updateOneMock = vi.fn().mockResolvedValue({ modifiedCount: 1 });
    getDatabaseMock.mockResolvedValue({
      collection: () => ({
        findOne: vi.fn().mockResolvedValue({
          _id: { toHexString: () => cautionId },
          status: "EN_ATTENTE",
          ficheProvisoire: false,
          immutableAfterFinal: false,
          contratId: "c1",
          lonaciClientId: null,
          agenceId: null,
        }),
        updateOne: updateOneMock,
      }),
    });

    await expect(validateCautionN1(cautionId, chefSection)).resolves.toBeUndefined();
    expect(updateOneMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        $set: expect.objectContaining({ status: "VALIDE_N1" }),
      }),
    );
  });

  it("recordSuccessionValidationN1 : chef de section passe le contrôle rôle (pas ROLE_FORBIDDEN)", async () => {
    getDatabaseMock.mockResolvedValue({
      collection: () => ({
        findOne: vi.fn().mockResolvedValue(null),
      }),
    });

    await expect(
      recordSuccessionValidationN1({ caseId: validObjectId, actor: chefSection }),
    ).rejects.toThrow("CASE_NOT_FOUND");
    await expect(
      recordSuccessionValidationN1({ caseId: validObjectId, actor: chefSection }),
    ).rejects.not.toThrow("ROLE_FORBIDDEN");
  });

  it("transitionConcessionnaireInscription : VALIDATE_N1 attribue le code PDV au chef de section", async () => {
    findConcessionnaireByIdMock
      .mockResolvedValueOnce({
        deletedAt: null,
        inscriptionStatut: "SOUMIS",
        codePdv: null,
        agenceId: validObjectId,
      })
      .mockResolvedValueOnce({
        deletedAt: null,
        inscriptionStatut: "DOSSIER_EN_COURS",
        codePdv: "ABJ-00042",
        agenceId: validObjectId,
      });
    nextCodePdvForAgenceMock.mockResolvedValue("ABJ-00042");
    prismaUpdateManyMock.mockResolvedValue({ count: 1 });

    const updated = await transitionConcessionnaireInscription({
      concessionnaireId: validObjectId,
      action: "VALIDATE_N1",
      actor: chefSection,
    });

    expect(updated.codePdv).toBe("ABJ-00042");
    expect(prismaUpdateManyMock).toHaveBeenCalled();
  });

  it("transitionAgrement : RECU -> CONTROLE (N1) autorisé au chef de section", async () => {
    const updateOneMock = vi.fn().mockResolvedValue({ modifiedCount: 1 });
    getDatabaseMock.mockResolvedValue({
      collection: () => ({
        findOne: vi.fn().mockResolvedValue({ _id: validObjectId, statut: "RECU", deletedAt: null }),
        updateOne: updateOneMock,
      }),
    });

    await expect(
      transitionAgrement({
        id: validObjectId,
        target: "CONTROLE",
        actor: chefSection,
      }),
    ).resolves.toBeUndefined();
    expect(updateOneMock).toHaveBeenCalled();
  });

  it("transitionCession : SAISIE_AGENT -> CONTROLE_CHEF_SECTION (N1) autorisé au chef de section", async () => {
    const updateOneMock = vi.fn().mockResolvedValue({ modifiedCount: 1 });
    findConcessionnaireByIdMock.mockResolvedValue({
      _id: validObjectId,
      agenceId: null,
      deletedAt: null,
    });
    getDatabaseMock.mockResolvedValue({
      collection: () => ({
        findOne: vi.fn().mockResolvedValue({
          _id: validObjectId,
          statut: "SAISIE_AGENT",
          kind: "DELOCALISATION",
          concessionnaireId: validObjectId,
          reference: "CESS-001",
          commentaire: null,
          documentChecklist: { entries: [], complet: true },
          deletedAt: null,
        }),
        updateOne: updateOneMock,
      }),
    });

    await expect(
      transitionCession({
        id: validObjectId,
        target: "CONTROLE_CHEF_SECTION",
        commentaire: "ok",
        actor: chefSection,
      }),
    ).resolves.toBeUndefined();
    expect(updateOneMock).toHaveBeenCalled();
  });

  it("transitionGprRegistration : SOUMIS_AGENT -> VALIDE_N1 autorisé au chef de section", async () => {
    const updateOneMock = vi.fn().mockResolvedValue({ modifiedCount: 1 });
    getDatabaseMock.mockResolvedValue({
      collection: () => ({
        findOne: vi.fn().mockResolvedValue({
          _id: validObjectId,
          status: "SOUMIS_AGENT",
          concessionnaireId: validObjectId,
          produitsActifs: ["LOTO"],
          dateEnregistrement: new Date(),
          deletedAt: null,
        }),
        updateOne: updateOneMock,
      }),
    });

    await expect(
      transitionGprRegistration({
        registrationId: validObjectId,
        targetStatus: "VALIDE_N1",
        comment: null,
        actor: chefSection,
      }),
    ).resolves.toBeUndefined();
    expect(updateOneMock).toHaveBeenCalled();
  });

  it("transitionResiliation : DOSSIER_RECU -> CONTROLE_CHEF_SECTION (N1) autorisé au chef de section", async () => {
    const updateOneMock = vi.fn().mockResolvedValue({ modifiedCount: 1 });
    findConcessionnaireByIdMock.mockResolvedValue({
      _id: validObjectId,
      agenceId: null,
      deletedAt: null,
    });
    getDatabaseMock.mockResolvedValue({
      collection: () => ({
        findOne: vi.fn().mockResolvedValue({
          _id: validObjectId,
          concessionnaireId: validObjectId,
          statut: "DOSSIER_RECU",
          produitCode: "LOTO",
          commentaire: null,
          documentChecklist: {
            entries: [
              {
                itemId: "resiliation_demande_signee",
                libelle: "Demande signée",
                statut: "FOURNI",
                obligatoire: true,
              },
            ],
            complet: true,
          },
          deletedAt: null,
        }),
        updateOne: updateOneMock,
      }),
    });

    await expect(
      transitionResiliation({
        id: validObjectId,
        target: "CONTROLE_CHEF_SECTION",
        commentaire: "ok",
        actor: chefSection,
      }),
    ).resolves.toBeUndefined();
    expect(updateOneMock).toHaveBeenCalled();
  });

  it("validateClientCreationN1 : assistant CDS peut aussi avancer (approvals off)", async () => {
    prismaFindFirstMock.mockResolvedValue({
      id: validObjectId,
      statut: "EN_ATTENTE_N1",
      code: "ABJ-001",
      nomComplet: "Client Test",
      raisonSociale: "Client Test",
    });
    prismaUpdateMock.mockResolvedValue({
      id: validObjectId,
      statut: "DOSSIER_EN_COURS",
      code: "ABJ-001",
      nomComplet: "Client Test",
      raisonSociale: "Client Test",
    });

    await expect(
      validateClientCreationN1(validObjectId, { role: "ASSIST_CDS", _id: "u2" } as unknown as UserDocument),
    ).resolves.toMatchObject({ statut: "DOSSIER_EN_COURS" });
  });
});
