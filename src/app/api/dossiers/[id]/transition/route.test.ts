import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireApiAuthMock,
  ensureDossierIndexesMock,
  findDossierByIdMock,
  transitionDossierMock,
  hasActiveContractForProductMock,
  finalizeContratFromDossierMock,
} = vi.hoisted(() => ({
  requireApiAuthMock: vi.fn(),
  ensureDossierIndexesMock: vi.fn(),
  findDossierByIdMock: vi.fn(),
  transitionDossierMock: vi.fn(),
  hasActiveContractForProductMock: vi.fn(),
  finalizeContratFromDossierMock: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({
  requireApiAuth: requireApiAuthMock,
}));

vi.mock("@/lib/lonaci/dossiers", () => ({
  ensureDossierIndexes: ensureDossierIndexesMock,
  findDossierById: findDossierByIdMock,
  findVisibleDossierById: findDossierByIdMock,
  transitionDossier: transitionDossierMock,
}));

vi.mock("@/lib/lonaci/contracts", () => ({
  hasActiveContractForProduct: hasActiveContractForProductMock,
  finalizeContratFromDossier: finalizeContratFromDossierMock,
}));

import { POST } from "./route";

const actor = { _id: "u1", role: "CHEF_SERVICE" } as const;

function makeReq(action: string) {
  return new NextRequest("http://localhost:3000/api/dossiers/abc/transition", {
    method: "POST",
    body: JSON.stringify({ action }),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/dossiers/[id]/transition RBAC mapping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireApiAuthMock.mockResolvedValue({ user: actor });
    ensureDossierIndexesMock.mockResolvedValue(undefined);
    findDossierByIdMock.mockResolvedValue({
      _id: "abc",
      deletedAt: null,
      status: "BROUILLON",
      type: "CONTRAT_ACTUALISATION",
      payload: {
        produitCode: "LOTO",
        operationType: "NOUVEAU",
        dateEffet: new Date().toISOString(),
      },
      concessionnaireId: "c1",
    });
    transitionDossierMock.mockResolvedValue({});
    hasActiveContractForProductMock.mockResolvedValue(false);
    finalizeContratFromDossierMock.mockResolvedValue({});
  });

  it("mappe VALIDATE_N1", async () => {
    const req = makeReq("VALIDATE_N1");
    await POST(req, { params: Promise.resolve({ id: "abc" }) });
    expect(requireApiAuthMock).toHaveBeenCalledWith(
      req,
      expect.objectContaining({
        rbac: { resource: "DOSSIERS", action: "VALIDATE_N1" },
      }),
    );
  });

  it("mappe VALIDATE_N2", async () => {
    const req = makeReq("VALIDATE_N2");
    await POST(req, { params: Promise.resolve({ id: "abc" }) });
    expect(requireApiAuthMock).toHaveBeenCalledWith(
      req,
      expect.objectContaining({
        rbac: { resource: "DOSSIERS", action: "VALIDATE_N2" },
      }),
    );
  });

  it("mappe FINALIZE", async () => {
    const req = makeReq("FINALIZE");
    await POST(req, { params: Promise.resolve({ id: "abc" }) });
    expect(requireApiAuthMock).toHaveBeenCalledWith(
      req,
      expect.objectContaining({
        rbac: { resource: "DOSSIERS", action: "FINALIZE" },
      }),
    );
  });

  it("mappe REJECT", async () => {
    const req = new NextRequest("http://localhost:3000/api/dossiers/abc/transition", {
      method: "POST",
      body: JSON.stringify({ action: "REJECT", comment: "motif" }),
      headers: { "Content-Type": "application/json" },
    });
    await POST(req, { params: Promise.resolve({ id: "abc" }) });
    expect(requireApiAuthMock).toHaveBeenCalledWith(
      req,
      expect.objectContaining({
        rbac: { resource: "DOSSIERS", action: "REJECT" },
      }),
    );
  });
});
