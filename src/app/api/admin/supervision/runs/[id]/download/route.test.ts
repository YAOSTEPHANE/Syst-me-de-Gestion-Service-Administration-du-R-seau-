import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireApiAuthMock, getDatabaseMock, findOneMock } = vi.hoisted(() => ({
  requireApiAuthMock: vi.fn(),
  getDatabaseMock: vi.fn(),
  findOneMock: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({
  requireApiAuth: requireApiAuthMock,
}));

vi.mock("@/lib/mongodb", () => ({
  getDatabase: getDatabaseMock,
}));

import { expectResponse } from "@/test-utils/expect-response";

import { GET } from "./route";

describe("GET /api/admin/supervision/runs/[id]/download", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireApiAuthMock.mockResolvedValue({ user: { _id: "admin", role: "CHEF_SERVICE" } });
    getDatabaseMock.mockResolvedValue({
      collection: vi.fn().mockReturnValue({
        findOne: findOneMock,
      }),
    });
  });

  it("retourne le fichier de run", async () => {
    const payload = Buffer.from("hello", "utf8").toString("base64");
    findOneMock.mockResolvedValue({
      artifact: {
        filename: "run.csv",
        contentType: "text/csv",
        dataBase64: payload,
      },
    });

    const req = new NextRequest("http://localhost:3000/api/admin/supervision/runs/507f1f77bcf86cd799439011/download");
    const res = await GET(req, { params: Promise.resolve({ id: "507f1f77bcf86cd799439011" }) });
    expectResponse(res);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
  });
});
