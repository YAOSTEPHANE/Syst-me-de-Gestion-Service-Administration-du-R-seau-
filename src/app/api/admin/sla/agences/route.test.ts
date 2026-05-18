import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireApiAuthMock, getAgenceSlaSnapshotMock } = vi.hoisted(() => ({
  requireApiAuthMock: vi.fn(),
  getAgenceSlaSnapshotMock: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({
  requireApiAuth: requireApiAuthMock,
}));

vi.mock("@/lib/lonaci/dashboard-stats", () => ({
  getAgenceSlaSnapshot: getAgenceSlaSnapshotMock,
}));

import { expectResponse } from "@/test-utils/expect-response";

import { GET } from "./route";

describe("GET /api/admin/sla/agences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireApiAuthMock.mockResolvedValue({ user: { _id: "admin", role: "CHEF_SERVICE" } });
    getAgenceSlaSnapshotMock.mockResolvedValue([
      { agenceId: "a1", overdueTotal: 2 },
      { agenceId: "a2", overdueTotal: 0 },
    ]);
  });

  it("retourne les indicateurs SLA par agence", async () => {
    const req = new NextRequest("http://localhost:3000/api/admin/sla/agences");
    const res = await GET(req);
    expectResponse(res);
    expect(res.status).toBe(200);
    expect(getAgenceSlaSnapshotMock).toHaveBeenCalledWith(undefined);
  });

  it("propage le filtre agenceId", async () => {
    const req = new NextRequest("http://localhost:3000/api/admin/sla/agences?agenceId=ag-1");
    const res = await GET(req);
    expectResponse(res);
    expect(res.status).toBe(200);
    expect(getAgenceSlaSnapshotMock).toHaveBeenCalledWith("ag-1");
  });

  it("filtre OVERDUE et renvoie pagination", async () => {
    const req = new NextRequest("http://localhost:3000/api/admin/sla/agences?status=OVERDUE&page=1&pageSize=10");
    const res = await GET(req);
    expectResponse(res);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: Array<{ agenceId: string }>;
      pagination: { total: number; totalPages: number };
    };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.agenceId).toBe("a1");
    expect(body.pagination.total).toBe(1);
    expect(body.pagination.totalPages).toBe(1);
  });
});
