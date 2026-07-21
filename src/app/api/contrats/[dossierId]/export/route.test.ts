import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireApiAuthMock,
  findVisibleDossierByIdMock,
} = vi.hoisted(() => ({
  requireApiAuthMock: vi.fn(),
  findVisibleDossierByIdMock: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({
  requireApiAuth: requireApiAuthMock,
}));

vi.mock("@/lib/lonaci/dossiers", () => ({
  findVisibleDossierById: findVisibleDossierByIdMock,
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
    findVisibleDossierByIdMock.mockResolvedValue(baseDossier);
  });

  it("autorise le récap PDF pour un dossier rattaché à un client", async () => {
    const req = new NextRequest("http://localhost:3000/api/contrats/d1/export?view=1");
    const res = await GET(req, { params: Promise.resolve({ dossierId: "d1" }) });
    expect(res).toBeDefined();
    if (!res) throw new Error("La route d’export doit retourner une réponse");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toContain("inline");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    const body = Buffer.from(await res.arrayBuffer());
    expect(body.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(findVisibleDossierByIdMock).toHaveBeenCalledWith("d1", actor);
  });

  it("répond 404 sans distinguer un dossier absent d'un dossier hors scope", async () => {
    findVisibleDossierByIdMock.mockResolvedValue(null);
    const req = new NextRequest("http://localhost:3000/api/contrats/d1/export");
    const res = await GET(req, { params: Promise.resolve({ dossierId: "d1" }) });
    expect(res).toBeDefined();
    if (!res) throw new Error("La route d’export doit retourner une réponse");
    expect(res.status).toBe(404);
  });
});
