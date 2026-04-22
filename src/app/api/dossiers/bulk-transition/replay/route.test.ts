import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireApiAuthMock,
  ensureDossierIndexesMock,
  ensureBulkTransitionLogsIndexesMock,
  findBulkTransitionLogByIdMock,
  appendBulkTransitionLogMock,
  executeDossierBulkTransitionMock,
} = vi.hoisted(() => ({
  requireApiAuthMock: vi.fn(),
  ensureDossierIndexesMock: vi.fn(),
  ensureBulkTransitionLogsIndexesMock: vi.fn(),
  findBulkTransitionLogByIdMock: vi.fn(),
  appendBulkTransitionLogMock: vi.fn(),
  executeDossierBulkTransitionMock: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({
  requireApiAuth: requireApiAuthMock,
}));

vi.mock("@/lib/lonaci/dossiers", () => ({
  ensureDossierIndexes: ensureDossierIndexesMock,
}));

vi.mock("@/lib/lonaci/dossier-bulk-transition-logs", () => ({
  ensureBulkTransitionLogsIndexes: ensureBulkTransitionLogsIndexesMock,
  findBulkTransitionLogById: findBulkTransitionLogByIdMock,
  appendBulkTransitionLog: appendBulkTransitionLogMock,
}));

vi.mock("@/lib/lonaci/dossier-bulk-transition", () => ({
  toDossierBulkRbacAction: vi.fn(() => "UPDATE"),
  executeDossierBulkTransition: executeDossierBulkTransitionMock,
}));

import { expectResponse } from "@/test-utils/expect-response";

import { POST } from "./route";

describe("POST /api/dossiers/bulk-transition/replay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireApiAuthMock.mockResolvedValue({ user: { _id: "admin-1", role: "CHEF_SERVICE" } });
    ensureDossierIndexesMock.mockResolvedValue(undefined);
    ensureBulkTransitionLogsIndexesMock.mockResolvedValue(undefined);
    appendBulkTransitionLogMock.mockResolvedValue(undefined);
    findBulkTransitionLogByIdMock.mockResolvedValue({
      id: "log-1",
      actorUserId: "admin-1",
      action: "SUBMIT",
      total: 3,
      succeeded: 1,
      failed: 2,
      comment: null,
      resultSample: [
        { id: "d-ok", ok: true, message: "ok" },
        { id: "d-ko-1", ok: false, message: "ko1" },
        { id: "d-ko-2", ok: false, message: "ko2" },
      ],
      createdAt: new Date().toISOString(),
    });
    executeDossierBulkTransitionMock.mockResolvedValue({
      total: 2,
      succeeded: 2,
      failed: 0,
      results: [
        { id: "d-ko-1", ok: true, message: "ok" },
        { id: "d-ko-2", ok: true, message: "ok" },
      ],
    });
  });

  it("rejoue les échecs d'un journal", async () => {
    const req = new NextRequest("http://localhost:3000/api/dossiers/bulk-transition/replay", {
      method: "POST",
      body: JSON.stringify({ logId: "log-1", mode: "FAILED_ONLY" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expectResponse(res);
    expect(res.status).toBe(200);
    expect(executeDossierBulkTransitionMock).toHaveBeenCalledWith(
      expect.objectContaining({ ids: ["d-ko-1", "d-ko-2"] }),
    );
  });

  it("rejoue tout l'échantillon en mode ALL_SAMPLE", async () => {
    executeDossierBulkTransitionMock.mockResolvedValueOnce({
      total: 3,
      succeeded: 3,
      failed: 0,
      results: [
        { id: "d-ok", ok: true, message: "ok" },
        { id: "d-ko-1", ok: true, message: "ok" },
        { id: "d-ko-2", ok: true, message: "ok" },
      ],
    });
    const req = new NextRequest("http://localhost:3000/api/dossiers/bulk-transition/replay", {
      method: "POST",
      body: JSON.stringify({ logId: "log-1", mode: "ALL_SAMPLE" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expectResponse(res);
    expect(res.status).toBe(200);
    expect(executeDossierBulkTransitionMock).toHaveBeenCalledWith(
      expect.objectContaining({ ids: ["d-ok", "d-ko-1", "d-ko-2"] }),
    );
  });

  it("refuse une action sensible sans commentaire explicite", async () => {
    findBulkTransitionLogByIdMock.mockResolvedValueOnce({
      id: "log-sensitive",
      actorUserId: "admin-1",
      action: "REJECT",
      total: 1,
      succeeded: 0,
      failed: 1,
      comment: null,
      resultSample: [{ id: "d-ko", ok: false, message: "ko" }],
      createdAt: new Date().toISOString(),
    });
    const req = new NextRequest("http://localhost:3000/api/dossiers/bulk-transition/replay", {
      method: "POST",
      body: JSON.stringify({ logId: "log-sensitive", mode: "ALL_SAMPLE" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expectResponse(res);
    expect(res.status).toBe(400);
  });

  it("autorise une action sensible avec commentaire explicite", async () => {
    findBulkTransitionLogByIdMock.mockResolvedValueOnce({
      id: "log-sensitive",
      actorUserId: "admin-1",
      action: "REJECT",
      total: 1,
      succeeded: 0,
      failed: 1,
      comment: null,
      resultSample: [{ id: "d-ko", ok: false, message: "ko" }],
      createdAt: new Date().toISOString(),
    });
    executeDossierBulkTransitionMock.mockResolvedValueOnce({
      total: 1,
      succeeded: 1,
      failed: 0,
      results: [{ id: "d-ko", ok: true, message: "ok" }],
    });
    const req = new NextRequest("http://localhost:3000/api/dossiers/bulk-transition/replay", {
      method: "POST",
      body: JSON.stringify({ logId: "log-sensitive", mode: "ALL_SAMPLE", commentOverride: "Rejeu validé" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expectResponse(res);
    expect(res.status).toBe(200);
    expect(executeDossierBulkTransitionMock).toHaveBeenCalledWith(
      expect.objectContaining({ comment: "Rejeu validé" }),
    );
  });

  it("retourne 404 si journal absent", async () => {
    findBulkTransitionLogByIdMock.mockResolvedValueOnce(null);
    const req = new NextRequest("http://localhost:3000/api/dossiers/bulk-transition/replay", {
      method: "POST",
      body: JSON.stringify({ logId: "missing" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expectResponse(res);
    expect(res.status).toBe(404);
  });
});
