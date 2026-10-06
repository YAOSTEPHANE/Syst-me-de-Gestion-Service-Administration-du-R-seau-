import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  counter: { upsert: vi.fn(), findUnique: vi.fn() },
  contrat: { count: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  lonaciClient: { update: vi.fn() },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/lonaci/audit", () => ({ appendAuditLog: vi.fn() }));
vi.mock("@/lib/lonaci/clients", () => ({
  findLonaciClientById: vi.fn(async () => ({ _id: "client-1", statut: "ACTIF" })),
}));
vi.mock("@/lib/lonaci/concessionnaires", () => ({
  findConcessionnaireById: vi.fn(),
  updateConcessionnaire: vi.fn(),
}));
vi.mock("@/lib/lonaci/contrat-document", () => ({
  referenceAnnexeFromContrat: (ref: string) => ref.replace("CONTRAT-", "ANNEXE-"),
}));

import { finalizeContratFromDossier } from "@/lib/lonaci/contracts";
import type { UserDocument } from "@/lib/lonaci/types";

const actor = { _id: "user-1" } as UserDocument;

function contratRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "contrat-1",
    reference: "CONTRAT-LOTO-2026-07-0006",
    annexeReference: "ANNEXE-LOTO-2026-07-0006",
    concessionnaireId: null,
    lonaciClientId: "client-1",
    produitCode: "LOTO",
    operationType: "NOUVEAU",
    status: "ACTIF",
    dateEffet: new Date("2026-07-13T12:00:00.000Z"),
    dossierId: "dossier-1",
    createdByUserId: "user-1",
    updatedByUserId: "user-1",
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

const input = {
  dossierId: "dossier-1",
  concessionnaireId: null,
  lonaciClientId: "client-1",
  produitCode: "loto",
  operationType: "NOUVEAU" as const,
  dateEffet: new Date("2026-07-13T12:00:00.000Z"),
  actor,
};

describe("finalizeContratFromDossier", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.counter.findUnique.mockResolvedValue({ seq: 6 });
    prismaMock.contrat.count.mockResolvedValue(0);
    prismaMock.contrat.update.mockResolvedValue(contratRow());
    prismaMock.contrat.create.mockResolvedValue(contratRow());
  });

  it("crée le contrat quand aucune ligne supprimée n'existe pour le dossier", async () => {
    prismaMock.contrat.findFirst.mockResolvedValue(null);

    const contrat = await finalizeContratFromDossier(input);

    expect(prismaMock.contrat.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.contrat.update).not.toHaveBeenCalled();
    expect(contrat.reference).toBe("CONTRAT-LOTO-2026-07-0006");
  });

  it("réutilise la ligne supprimée du même dossier et produit (index unique)", async () => {
    prismaMock.contrat.findFirst.mockImplementation(async ({ where }) =>
      where.deletedAt ? { id: "old-contrat", reference: "CONTRAT-LOTO-2026-07-0002" } : null,
    );

    await finalizeContratFromDossier(input);

    expect(prismaMock.contrat.create).not.toHaveBeenCalled();
    expect(prismaMock.contrat.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "old-contrat" },
        data: expect.objectContaining({
          reference: "CONTRAT-LOTO-2026-07-0006",
          status: "ACTIF",
          deletedAt: null,
          produitCode: "LOTO",
        }),
      }),
    );
  });
});
