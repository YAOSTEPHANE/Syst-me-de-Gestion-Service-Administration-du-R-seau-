import { describe, expect, it, vi } from "vitest";

import { canRole } from "@/lib/auth/rbac";
import { WORKFLOW_SEPARATION_ERRORS } from "@/lib/lonaci/workflow-separation";
import type { UserDocument } from "@/lib/lonaci/types";

const validObjectId = "507f1f77bcf86cd799439011";

// Mock du module MongoDB pour les transitions qui sinon iraient en base.
vi.mock("@/lib/mongodb", () => ({
  getDatabase: vi.fn(),
}));

// Mock Concessionnaires pour tester l'erreur sans toucher la base.
vi.mock("@/lib/lonaci/concessionnaires", () => ({
  findConcessionnaireById: vi.fn(),
  nextCodePdvForAgence: vi.fn(),
}));

// Mock Prisma (sécurité : certaines fonctions importent prisma même si le chemin interdit l'évite).
vi.mock("@/lib/prisma", () => ({
  prisma: {
    concessionnaire: {
      updateMany: vi.fn(),
    },
  },
}));

import { getDatabase } from "@/lib/mongodb";
import { findConcessionnaireById } from "@/lib/lonaci/concessionnaires";
import { transitionAgrement } from "@/lib/lonaci/agrements";
import { transitionCession } from "@/lib/lonaci/cessions";
import { transitionConcessionnaireInscription } from "@/lib/lonaci/concessionnaire-inscription";
import { validateClientCreationN1 } from "@/lib/lonaci/clients";
import { validateCautionN1 } from "@/lib/lonaci/sprint4";
import { recordSuccessionValidationN1 } from "@/lib/lonaci/succession";

describe("Chef de service - Validation N1 (sécurité)", () => {
  it("RBAC : bloque CHEF_SERVICE sur DOSSIERS/CAUTIONS/AGREMENTS/CESSIONS (VALIDATE_N1)", () => {
    const cases = [
      { resource: "DOSSIERS", action: "VALIDATE_N1" as const },
      { resource: "CAUTIONS", action: "VALIDATE_N1" as const },
      { resource: "AGREMENTS", action: "VALIDATE_N1" as const },
      { resource: "CESSIONS", action: "VALIDATE_N1" as const },
    ] as const;

    for (const c of cases) {
      const r = canRole({ role: "CHEF_SERVICE", resource: c.resource, action: c.action });
      expect(r.allowed).toBe(false);
    }
  });

  it("validateClientCreationN1 : chef de service doit être interdit (ROLE_FORBIDDEN)", async () => {
    await expect(
      validateClientCreationN1("not-an-id", { role: "CHEF_SERVICE", _id: "u1" } as unknown as UserDocument),
    ).rejects.toThrow("ROLE_FORBIDDEN");
  });

  it("validateCautionN1 : chef de service doit être interdit (ROLE_FORBIDDEN)", async () => {
    await expect(
      validateCautionN1(validObjectId, { role: "CHEF_SERVICE", _id: "u1" } as unknown as UserDocument),
    ).rejects.toThrow("ROLE_FORBIDDEN");
  });

  it("recordSuccessionValidationN1 : chef de service doit être interdit (ROLE_FORBIDDEN)", async () => {
    await expect(
      recordSuccessionValidationN1({
        caseId: validObjectId,
        actor: { role: "CHEF_SERVICE", _id: "u1" } as unknown as UserDocument,
      }),
    ).rejects.toThrow("ROLE_FORBIDDEN");
  });

  it("transitionConcessionnaireInscription : VALIDATE_N1 interdit au chef de service (INSCRIPTION_N1_CHEF_SECTION_ONLY)", async () => {
    const findConcessionnaireByIdMock = findConcessionnaireById as unknown as {
      mockResolvedValue: (v: unknown) => void;
    };
    findConcessionnaireByIdMock.mockResolvedValue({
      deletedAt: null,
      inscriptionStatut: "SOUMIS",
      codePdv: null,
    });

    await expect(
      transitionConcessionnaireInscription({
        concessionnaireId: validObjectId,
        action: "VALIDATE_N1",
        actor: { role: "CHEF_SERVICE", _id: "u1" } as unknown as UserDocument,
      }),
    ).rejects.toThrow(WORKFLOW_SEPARATION_ERRORS.INSCRIPTION_N1_CHEF_SECTION_ONLY);
  });

  it("transitionAgrement : masque la file N1 au chef de service", async () => {
    (getDatabase as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue({
      collection: () => ({
        findOne: vi.fn().mockResolvedValue({
          statut: "RECU",
        }),
      }),
    });

    await expect(
      transitionAgrement({
        id: validObjectId,
        target: "CONTROLE",
        actor: { role: "CHEF_SERVICE", _id: "u1" } as unknown as UserDocument,
      }),
    ).rejects.toThrow("AGREMENT_NOT_FOUND");
  });

  it("transitionCession : masque la file N1 au chef de service", async () => {
    (getDatabase as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue({
      collection: () => ({
        findOne: vi.fn().mockResolvedValue({
          statut: "SAISIE_AGENT",
          kind: "DELOCALISATION",
        }),
      }),
    });

    await expect(
      transitionCession({
        id: validObjectId,
        target: "CONTROLE_CHEF_SECTION",
        commentaire: "test",
        actor: { role: "CHEF_SERVICE", _id: "u1" } as unknown as UserDocument,
      }),
    ).rejects.toThrow("CESSION_NOT_FOUND");
  });
});

