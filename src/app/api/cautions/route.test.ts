import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { expectResponse } from "@/test-utils/expect-response";

const {
  ensureSprint4IndexesMock,
  listCautionsForTabMock,
  requireApiAuthMock,
  resolveListAgenceFilterMock,
} = vi.hoisted(() => ({
  ensureSprint4IndexesMock: vi.fn(),
  listCautionsForTabMock: vi.fn(),
  requireApiAuthMock: vi.fn(),
  resolveListAgenceFilterMock: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({ requireApiAuth: requireApiAuthMock }));
vi.mock("@/lib/lonaci/access", () => ({
  resolveListAgenceFilter: resolveListAgenceFilterMock,
}));
vi.mock("@/lib/lonaci/sprint4", () => ({
  CAUTION_LIST_TABS: ["J10_OVERDUE", "EN_ATTENTE", "VALIDATED_THIS_MONTH"],
  createCaution: vi.fn(),
  ensureSprint4Indexes: ensureSprint4IndexesMock,
  listCautionsForTab: listCautionsForTabMock,
}));
vi.mock("@/lib/lonaci/constants", () => ({
  CAUTION_ENCAISSEMENT_MODES: ["ESPECES"],
  CAUTION_PAYMENT_MODES: ["ESPECES", "PAIEMENT_DIFFERE"],
}));

import { GET } from "./route";

describe("GET /api/cautions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireApiAuthMock.mockResolvedValue({
      user: { _id: "agent-1", role: "AGENT", agenceId: "agence-a", agencesAutorisees: [] },
    });
    resolveListAgenceFilterMock.mockReturnValue({ ok: true, agenceId: "agence-a" });
    listCautionsForTabMock.mockResolvedValue({ items: [], total: 0 });
  });

  it("transmet acteur et scope agence au filtre serveur avant pagination", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/cautions?tab=EN_ATTENTE&page=2&pageSize=25"),
    );

    expectResponse(response);
    expect(response.status).toBe(200);
    expect(listCautionsForTabMock).toHaveBeenCalledWith(
      "EN_ATTENTE",
      2,
      25,
      { _id: "agent-1", role: "AGENT", agenceId: "agence-a", agencesAutorisees: [] },
      { agenceId: "agence-a", agenceIds: undefined },
      undefined,
    );
  });

  it("transmet le terme de recherche q", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/cautions?tab=EN_ATTENTE&page=1&pageSize=50&q=FPC-2026"),
    );

    expectResponse(response);
    expect(response.status).toBe(200);
    expect(listCautionsForTabMock).toHaveBeenCalledWith(
      "EN_ATTENTE",
      1,
      50,
      expect.anything(),
      expect.anything(),
      "FPC-2026",
    );
  });
});
