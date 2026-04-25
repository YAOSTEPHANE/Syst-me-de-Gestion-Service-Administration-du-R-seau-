import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireApiAuthMock, getDatabaseMock, countDocumentsMock, toArrayMock } = vi.hoisted(() => ({
  requireApiAuthMock: vi.fn(),
  getDatabaseMock: vi.fn(),
  countDocumentsMock: vi.fn(),
  toArrayMock: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({
  requireApiAuth: requireApiAuthMock,
}));

vi.mock("@/lib/mongodb", () => ({
  getDatabase: getDatabaseMock,
}));

import { expectResponse } from "@/test-utils/expect-response";

import { GET } from "./route";

describe("GET /api/admin/supervision/runs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireApiAuthMock.mockResolvedValue({ user: { _id: "admin", role: "CHEF_SERVICE" } });
    const cursor = {
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      toArray: toArrayMock,
    };
    const collection = {
      countDocuments: countDocumentsMock,
      find: vi.fn().mockReturnValue(cursor),
    };
    getDatabaseMock.mockResolvedValue({
      collection: vi.fn().mockReturnValue(collection),
    });
    countDocumentsMock.mockResolvedValue(1);
    toArrayMock.mockResolvedValue([
      {
        _id: "abc",
        createdAt: new Date("2026-04-23T10:00:00.000Z"),
        status: "OK",
        summary: { format: "csv" },
        artifact: { filename: "f.csv", contentType: "text/csv" },
      },
    ]);
  });

  it("retourne les runs pagines", async () => {
    const req = new NextRequest("http://localhost:3000/api/admin/supervision/runs?page=1&pageSize=10");
    const res = await GET(req);
    expectResponse(res);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ id: string }>; pagination: { total: number } };
    expect(body.items[0]?.id).toBe("abc");
    expect(body.pagination.total).toBe(1);
  });
});
