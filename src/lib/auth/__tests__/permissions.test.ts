import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireApiAuthMock } = vi.hoisted(() => ({
  requireApiAuthMock: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({
  requireApiAuth: requireApiAuthMock,
}));

import { checkPermission, resolveRbacAction } from "@/lib/auth/checkPermission";

describe("checkPermission middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireApiAuthMock.mockResolvedValue({ user: { _id: "u1", role: "CHEF_SERVICE" } });
  });

  it("delegue a requireApiAuth avec les options RBAC explicites", async () => {
    const req = new NextRequest("http://localhost:3000/api/test", { method: "POST" });
    await checkPermission(req, {
      roles: ["CHEF_SERVICE"],
      resource: "DOSSIERS",
      action: "FINALIZE",
      agenceId: "ag-1",
      produitCode: "PMU",
    });

    expect(requireApiAuthMock).toHaveBeenCalledWith(
      req,
      expect.objectContaining({
        roles: ["CHEF_SERVICE"],
        agenceId: "ag-1",
        produitCode: "PMU",
        rbac: { resource: "DOSSIERS", action: "FINALIZE" },
      }),
    );
  });
});

describe("resolveRbacAction", () => {
  it("retourne l'action mappee", () => {
    const action = resolveRbacAction("FINALISE", { FINALISE: "FINALIZE" }, "UPDATE");
    expect(action).toBe("FINALIZE");
  });

  it("retourne fallback si non mappe", () => {
    const action = resolveRbacAction("INCONNU", { FINALISE: "FINALIZE" }, "UPDATE");
    expect(action).toBe("UPDATE");
  });
});

