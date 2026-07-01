import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireApiAuthMock,
  findDossierByIdMock,
  assertDossierPartyReadableMock,
  contratPartyFromDossierMock,
} = vi.hoisted(() => ({
  requireApiAuthMock: vi.fn(),
  findDossierByIdMock: vi.fn(),
  assertDossierPartyReadableMock: vi.fn(),
  contratPartyFromDossierMock: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({
  requireApiAuth: requireApiAuthMock,
}));

vi.mock("@/lib/lonaci/dossiers", () => ({
  findDossierById: findDossierByIdMock,
}));

vi.mock("@/lib/lonaci/dossier-contrat-party", () => ({
  contratPartyFromDossier: contratPartyFromDossierMock,
  assertDossierPartyReadable: assertDossierPartyReadableMock,
}));

import { GET } from "./route";

const actor = { _id: "u1", role: "CHEF_SECTION", agenceId: "ag1" } as const;

const baseDossier = {
  _id: "d1",
  deletedAt: null,
  reference: "DOS-001",
  status: "VALIDE_N1",
  lonaciClientId: "client-1",
  concessionnaireId: null,
  payload: { produitCode: "LOTO", operationType: "NOUVEAU" },
  history: [],
};

describe("GET /api/contrats/[dossierId]/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireApiAuthMock.mockResolvedValue({ user: actor });
    findDossierByIdMock.mockResolvedValue(baseDossier);
    contratPartyFromDossierMock.mockReturnValue({ kind: "client", lonaciClientId: "client-1" });
    assertDossierPartyReadableMock.mockResolvedValue(undefined);
  });

  it("autorise le récap PDF pour un dossier rattaché à un client", async () => {
    const req = new NextRequest("http://localhost:3000/api/contrats/d1/export?view=1");
    const res = await GET(req, { params: Promise.resolve({ dossierId: "d1" }) });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(assertDossierPartyReadableMock).toHaveBeenCalled();
  });

  it("refuse si le titulaire du dossier est illisible", async () => {
    assertDossierPartyReadableMock.mockRejectedValue(new Error("AGENCE_FORBIDDEN"));
    const req = new NextRequest("http://localhost:3000/api/contrats/d1/export");
    const res = await GET(req, { params: Promise.resolve({ dossierId: "d1" }) });
    expect(res.status).toBe(403);
  });
});
