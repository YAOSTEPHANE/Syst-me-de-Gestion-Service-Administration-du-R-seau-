import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireApiAuthMock, ensureMonitoringEventsIndexesMock, listMonitoringEventsMock } = vi.hoisted(() => ({
  requireApiAuthMock: vi.fn(),
  ensureMonitoringEventsIndexesMock: vi.fn(),
  listMonitoringEventsMock: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({
  requireApiAuth: requireApiAuthMock,
}));

vi.mock("@/lib/observability/events", () => ({
  ensureMonitoringEventsIndexes: ensureMonitoringEventsIndexesMock,
  listMonitoringEvents: listMonitoringEventsMock,
}));

import { expectResponse } from "@/test-utils/expect-response";

import { GET } from "./route";

describe("GET /api/monitoring/events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireApiAuthMock.mockResolvedValue({ user: { _id: "u1", role: "CHEF_SERVICE" } });
    ensureMonitoringEventsIndexesMock.mockResolvedValue(undefined);
    listMonitoringEventsMock.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
  });

  it("retourne la liste paginée", async () => {
    const req = new NextRequest("http://localhost:3000/api/monitoring/events?page=1&pageSize=20&code=X1&status=OPEN");
    const res = await GET(req);
    expectResponse(res);
    expect(requireApiAuthMock).toHaveBeenCalled();
    expect(listMonitoringEventsMock).toHaveBeenCalledWith({ page: 1, pageSize: 20, code: "X1", status: "OPEN" });
    expect(res.status).toBe(200);
  });
});

