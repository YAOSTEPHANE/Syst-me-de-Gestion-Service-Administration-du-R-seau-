import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireApiAuthMock, ackMonitoringEventMock } = vi.hoisted(() => ({
  requireApiAuthMock: vi.fn(),
  ackMonitoringEventMock: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({
  requireApiAuth: requireApiAuthMock,
}));

vi.mock("@/lib/observability/events", () => ({
  ackMonitoringEvent: ackMonitoringEventMock,
}));

import { expectResponse } from "@/test-utils/expect-response";

import { POST } from "./route";

describe("POST /api/monitoring/events/[id]/ack", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireApiAuthMock.mockResolvedValue({ user: { _id: "u1", role: "CHEF_SERVICE" } });
    ackMonitoringEventMock.mockResolvedValue(true);
  });

  it("acquitte un evenement OPEN", async () => {
    const req = new NextRequest("http://localhost:3000/api/monitoring/events/evt1/ack", { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ id: "evt1" }) });
    expectResponse(res);
    expect(ackMonitoringEventMock).toHaveBeenCalledWith({ id: "evt1", actorUserId: "u1" });
    expect(res.status).toBe(200);
  });

  it("retourne 404 si introuvable ou deja ACK", async () => {
    ackMonitoringEventMock.mockResolvedValue(false);
    const req = new NextRequest("http://localhost:3000/api/monitoring/events/evt404/ack", { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ id: "evt404" }) });
    expectResponse(res);
    expect(res.status).toBe(404);
  });
});

