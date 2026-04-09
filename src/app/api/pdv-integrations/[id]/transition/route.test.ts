import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireApiAuthMock, ensureSprint4IndexesMock, transitionPdvIntegrationMock } = vi.hoisted(() => ({
  requireApiAuthMock: vi.fn(),
  ensureSprint4IndexesMock: vi.fn(),
  transitionPdvIntegrationMock: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({
  requireApiAuth: requireApiAuthMock,
}));

vi.mock("@/lib/lonaci/sprint4", () => ({
  ensureSprint4Indexes: ensureSprint4IndexesMock,
  transitionPdvIntegration: transitionPdvIntegrationMock,
}));

import { POST } from "./route";

const actor = { _id: "u1", role: "CHEF_SERVICE" } as const;

describe("POST /api/pdv-integrations/[id]/transition RBAC mapping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireApiAuthMock.mockResolvedValue({ user: actor });
    ensureSprint4IndexesMock.mockResolvedValue(undefined);
    transitionPdvIntegrationMock.mockResolvedValue(undefined);
  });

  it("mappe FINALISE vers action RBAC FINALIZE", async () => {
    const req = new NextRequest("http://localhost:3000/api/pdv-integrations/abc/transition", {
      method: "POST",
      body: JSON.stringify({ targetStatus: "FINALISE" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req, { params: Promise.resolve({ id: "abc" }) });

    expect(requireApiAuthMock).toHaveBeenCalledWith(
      req,
      expect.objectContaining({
        rbac: { resource: "PDV_INTEGRATIONS", action: "FINALIZE" },
      }),
    );
    expect(res.status).toBe(200);
  });

  it("mappe EN_TRAITEMENT vers action RBAC UPDATE", async () => {
    const req = new NextRequest("http://localhost:3000/api/pdv-integrations/abc/transition", {
      method: "POST",
      body: JSON.stringify({ targetStatus: "EN_TRAITEMENT" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req, { params: Promise.resolve({ id: "abc" }) });

    expect(requireApiAuthMock).toHaveBeenCalledWith(
      req,
      expect.objectContaining({
        rbac: { resource: "PDV_INTEGRATIONS", action: "UPDATE" },
      }),
    );
    expect(res.status).toBe(200);
  });
});
