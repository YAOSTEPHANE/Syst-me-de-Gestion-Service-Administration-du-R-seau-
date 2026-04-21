import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireApiAuthMock, ensureSprint4IndexesMock, listCautionAlertsJ10Mock } = vi.hoisted(() => ({
  requireApiAuthMock: vi.fn(),
  ensureSprint4IndexesMock: vi.fn(),
  listCautionAlertsJ10Mock: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({
  requireApiAuth: requireApiAuthMock,
}));

vi.mock("@/lib/lonaci/sprint4", () => ({
  ensureSprint4Indexes: ensureSprint4IndexesMock,
  listCautionAlertsJ10: listCautionAlertsJ10Mock,
}));

import { GET } from "./route";

describe("GET /api/cautions/alerts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireApiAuthMock.mockResolvedValue({ user: { _id: "u1", role: "CHEF_SERVICE" } });
    ensureSprint4IndexesMock.mockResolvedValue(undefined);
    listCautionAlertsJ10Mock.mockResolvedValue([
      { id: "a1", contratId: "c1", montant: 1000, dueDate: "2026-04-01", daysOverdue: 5 },
      { id: "a2", contratId: "c2", montant: 2000, dueDate: "2026-03-01", daysOverdue: 20 },
    ]);
  });

  it("applique minDaysOverdue et limit", async () => {
    const req = new NextRequest("http://localhost:3000/api/cautions/alerts?minDaysOverdue=10&limit=1");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ id: string }>; total: number };
    expect(body.total).toBe(1);
    expect(body.items[0]?.id).toBe("a2");
  });
});
