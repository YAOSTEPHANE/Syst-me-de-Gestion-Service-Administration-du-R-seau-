import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireApiAuthMock, runDailyJobsMock } = vi.hoisted(() => ({
  requireApiAuthMock: vi.fn(),
  runDailyJobsMock: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({
  requireApiAuth: requireApiAuthMock,
}));

vi.mock("@/app/api/cron/daily-jobs/route", () => ({
  POST: runDailyJobsMock,
}));

import { expectResponse } from "@/test-utils/expect-response";

import { POST } from "./route";

describe("POST /api/admin/supervision/runs/trigger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireApiAuthMock.mockResolvedValue({ user: { _id: "admin", role: "CHEF_SERVICE" } });
    process.env.CRON_SECRET = "test-secret";
    runDailyJobsMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  });

  it("relance le cron supervision en mode force", async () => {
    const req = new NextRequest("http://localhost:3000/api/admin/supervision/runs/trigger", { method: "POST" });
    const res = await POST(req);
    expectResponse(res);
    expect(res.status).toBe(200);
    expect(runDailyJobsMock).toHaveBeenCalledOnce();
  });

  it("propage 409 quand un run est deja en cours", async () => {
    runDailyJobsMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: false, locked: true, message: "Un run supervision est déjà en cours." }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const req = new NextRequest("http://localhost:3000/api/admin/supervision/runs/trigger", { method: "POST" });
    const res = await POST(req);
    expectResponse(res);
    expect(res.status).toBe(409);
    const body = (await res.json()) as { locked?: boolean };
    expect(body.locked).toBe(true);
  });
});
