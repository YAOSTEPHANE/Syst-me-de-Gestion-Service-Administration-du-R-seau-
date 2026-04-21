import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireApiAuthMock,
  ensureDossierIndexesMock,
  ensureBulkTransitionLogsIndexesMock,
  appendBulkTransitionLogMock,
  executeDossierBulkTransitionMock,
} = vi.hoisted(() => ({
  requireApiAuthMock: vi.fn(),
  ensureDossierIndexesMock: vi.fn(),
  ensureBulkTransitionLogsIndexesMock: vi.fn(),
  appendBulkTransitionLogMock: vi.fn(),
  executeDossierBulkTransitionMock: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({
  requireApiAuth: requireApiAuthMock,
}));

vi.mock("@/lib/lonaci/dossiers", () => ({
  ensureDossierIndexes: ensureDossierIndexesMock,
}));

vi.mock("@/lib/lonaci/dossier-bulk-transition", () => ({
  toDossierBulkRbacAction: vi.fn(() => "UPDATE"),
  executeDossierBulkTransition: executeDossierBulkTransitionMock,
}));

vi.mock("@/lib/lonaci/dossier-bulk-transition-logs", () => ({
  ensureBulkTransitionLogsIndexes: ensureBulkTransitionLogsIndexesMock,
  appendBulkTransitionLog: appendBulkTransitionLogMock,
}));

import { POST } from "./route";

describe("POST /api/dossiers/bulk-transition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireApiAuthMock.mockResolvedValue({ user: { _id: "admin-1", role: "CHEF_SERVICE" } });
    ensureDossierIndexesMock.mockResolvedValue(undefined);
    ensureBulkTransitionLogsIndexesMock.mockResolvedValue(undefined);
    appendBulkTransitionLogMock.mockResolvedValue(undefined);
    executeDossierBulkTransitionMock.mockResolvedValue({
      total: 2,
      succeeded: 2,
      failed: 0,
      results: [
        { id: "d1", ok: true, message: "Transition effectuée." },
        { id: "d2", ok: true, message: "Transition effectuée." },
      ],
    });
  });

  it("applique une transition en masse", async () => {
    const req = new NextRequest("http://localhost:3000/api/dossiers/bulk-transition", {
      method: "POST",
      body: JSON.stringify({ ids: ["d1", "d2"], action: "SUBMIT" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { succeeded: number; failed: number };
    expect(body.succeeded).toBe(2);
    expect(body.failed).toBe(0);
  });

  it("refuse reject sans commentaire", async () => {
    const req = new NextRequest("http://localhost:3000/api/dossiers/bulk-transition", {
      method: "POST",
      body: JSON.stringify({ ids: ["d1"], action: "REJECT" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
