import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireApiAuthMock, ensureSuccessionIndexesMock, listSuccessionStaleAlertsMock } = vi.hoisted(() => ({
  requireApiAuthMock: vi.fn(),
  ensureSuccessionIndexesMock: vi.fn(),
  listSuccessionStaleAlertsMock: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({
  requireApiAuth: requireApiAuthMock,
}));

vi.mock("@/lib/lonaci/succession", () => ({
  ensureSuccessionIndexes: ensureSuccessionIndexesMock,
  listSuccessionStaleAlerts: listSuccessionStaleAlertsMock,
}));

import { expectResponse } from "@/test-utils/expect-response";

import { GET } from "./route";

describe("GET /api/succession-cases/alerts/stale", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireApiAuthMock.mockResolvedValue({ user: { _id: "u1", role: "CHEF_SERVICE" } });
    ensureSuccessionIndexesMock.mockResolvedValue(undefined);
    listSuccessionStaleAlertsMock.mockResolvedValue([
      { id: "s1", reference: "S-001", concessionnaireId: "cx1", daysInactive: 12 },
      { id: "s2", reference: "S-002", concessionnaireId: "cx2", daysInactive: 44 },
    ]);
  });

  it("applique minDaysInactive et limit", async () => {
    const req = new NextRequest("http://localhost:3000/api/succession-cases/alerts/stale?minDaysInactive=30&limit=1");
    const res = await GET(req);
    expectResponse(res);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ id: string }>; total: number };
    expect(body.total).toBe(1);
    expect(body.items[0]?.id).toBe("s2");
  });
});
