import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireApiAuthMock, ensureBulkTransitionLogsIndexesMock, listBulkTransitionLogsMock, bulkTransitionLogsToCsvMock } =
  vi.hoisted(() => ({
  requireApiAuthMock: vi.fn(),
  ensureBulkTransitionLogsIndexesMock: vi.fn(),
  listBulkTransitionLogsMock: vi.fn(),
  bulkTransitionLogsToCsvMock: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({
  requireApiAuth: requireApiAuthMock,
}));

vi.mock("@/lib/lonaci/dossier-bulk-transition-logs", () => ({
  ensureBulkTransitionLogsIndexes: ensureBulkTransitionLogsIndexesMock,
  listVisibleBulkTransitionLogs: listBulkTransitionLogsMock,
  bulkTransitionLogsToCsv: bulkTransitionLogsToCsvMock,
}));

import { expectResponse } from "@/test-utils/expect-response";

import { GET } from "./route";

describe("GET /api/dossiers/bulk-transition/logs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireApiAuthMock.mockResolvedValue({ user: { _id: "u1", role: "CHEF_SERVICE" } });
    ensureBulkTransitionLogsIndexesMock.mockResolvedValue(undefined);
    listBulkTransitionLogsMock.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10 });
    bulkTransitionLogsToCsvMock.mockReturnValue("id\n1");
  });

  it("retourne les logs paginés", async () => {
    const req = new NextRequest(
      "http://localhost:3000/api/dossiers/bulk-transition/logs?page=2&pageSize=5&actorUserId=u2&action=SUBMIT&failedOnly=1",
    );
    const res = await GET(req);
    expectResponse(res);
    expect(res.status).toBe(200);
    expect(listBulkTransitionLogsMock).toHaveBeenCalledWith(
      {
        page: 2,
        pageSize: 5,
        actorUserId: "u2",
        action: "SUBMIT",
        failedOnly: true,
      },
      expect.objectContaining({ _id: "u1", role: "CHEF_SERVICE" }),
    );
  });

  it("exporte les logs en csv", async () => {
    const req = new NextRequest("http://localhost:3000/api/dossiers/bulk-transition/logs?format=csv");
    const res = await GET(req);
    expectResponse(res);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(bulkTransitionLogsToCsvMock).toHaveBeenCalled();
  });
});
