import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireApiAuthMock, ensureDossierIndexesMock, listDossiersMock } = vi.hoisted(() => ({
  requireApiAuthMock: vi.fn(),
  ensureDossierIndexesMock: vi.fn(),
  listDossiersMock: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({
  requireApiAuth: requireApiAuthMock,
}));

vi.mock("@/lib/lonaci/access", () => ({
  userHasNationalScope: vi.fn(() => true),
}));

vi.mock("@/lib/lonaci/dossiers", () => ({
  ensureDossierIndexes: ensureDossierIndexesMock,
  listDossiers: listDossiersMock,
  createDossier: vi.fn(),
}));

vi.mock("@/lib/lonaci/constants", () => ({
  CONTRAT_OPERATION_TYPES: ["NOUVEAU", "ACTUALISATION"],
  DOSSIER_STATUSES: ["BROUILLON", "SOUMIS", "VALIDE_N1", "VALIDE_N2", "FINALISE", "REJETE"],
  DOSSIER_TYPES: ["CONTRAT_ACTUALISATION"],
}));

import { GET } from "./route";

describe("GET /api/dossiers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireApiAuthMock.mockResolvedValue({ user: { _id: "u1", role: "CHEF_SERVICE", agenceId: null } });
    ensureDossierIndexesMock.mockResolvedValue(undefined);
    listDossiersMock.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
  });

  it("transmet les filtres avancés à listDossiers", async () => {
    const req = new NextRequest(
      "http://localhost:3000/api/dossiers?page=2&pageSize=50&status=SOUMIS&q=DOS-01&concessionnaireId=cx1&sortField=reference&sortOrder=asc",
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(listDossiersMock).toHaveBeenCalledWith(2, 50, "SOUMIS", undefined, undefined, "DOS-01", "cx1", "reference", "asc");
  });
});
