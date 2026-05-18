import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireApiAuthMock, ensureGprGrattageIndexesMock, transitionGprRegistrationMock } = vi.hoisted(() => ({
  requireApiAuthMock: vi.fn(),
  ensureGprGrattageIndexesMock: vi.fn(),
  transitionGprRegistrationMock: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({
  requireApiAuth: requireApiAuthMock,
}));

vi.mock("@/lib/lonaci/gpr-grattage", () => ({
  ensureGprGrattageIndexes: ensureGprGrattageIndexesMock,
  GPR_REGISTRATION_STATUSES: ["SOUMIS_AGENT", "VALIDE_N1", "VALIDE_N2", "SUIVI_CHEF_SERVICE", "REJETE"],
  transitionGprRegistration: transitionGprRegistrationMock,
}));

import { POST } from "./route";

const actor = { _id: "u1", role: "CHEF_SERVICE" } as const;

describe("POST /api/gpr-registrations/[id]/transition RBAC mapping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireApiAuthMock.mockResolvedValue({ user: actor });
    ensureGprGrattageIndexesMock.mockResolvedValue(undefined);
    transitionGprRegistrationMock.mockResolvedValue(undefined);
  });

  it("mappe VALIDE_N1 vers VALIDATE_N1", async () => {
    const req = new NextRequest("http://localhost:3000/api/gpr-registrations/abc/transition", {
      method: "POST",
      body: JSON.stringify({ targetStatus: "VALIDE_N1" }),
      headers: { "Content-Type": "application/json" },
    });
    await POST(req, { params: Promise.resolve({ id: "abc" }) });
    expect(requireApiAuthMock).toHaveBeenCalledWith(
      req,
      expect.objectContaining({
        rbac: { resource: "DOSSIERS", action: "VALIDATE_N1" },
      }),
    );
  });

  it("mappe VALIDE_N2 vers VALIDATE_N2", async () => {
    const req = new NextRequest("http://localhost:3000/api/gpr-registrations/abc/transition", {
      method: "POST",
      body: JSON.stringify({ targetStatus: "VALIDE_N2" }),
      headers: { "Content-Type": "application/json" },
    });
    await POST(req, { params: Promise.resolve({ id: "abc" }) });
    expect(requireApiAuthMock).toHaveBeenCalledWith(
      req,
      expect.objectContaining({
        rbac: { resource: "DOSSIERS", action: "VALIDATE_N2" },
      }),
    );
  });

  it("mappe SUIVI_CHEF_SERVICE vers FINALIZE", async () => {
    const req = new NextRequest("http://localhost:3000/api/gpr-registrations/abc/transition", {
      method: "POST",
      body: JSON.stringify({ targetStatus: "SUIVI_CHEF_SERVICE" }),
      headers: { "Content-Type": "application/json" },
    });
    await POST(req, { params: Promise.resolve({ id: "abc" }) });
    expect(requireApiAuthMock).toHaveBeenCalledWith(
      req,
      expect.objectContaining({
        rbac: { resource: "DOSSIERS", action: "FINALIZE" },
      }),
    );
  });

  it("mappe REJETE vers REJECT", async () => {
    const req = new NextRequest("http://localhost:3000/api/gpr-registrations/abc/transition", {
      method: "POST",
      body: JSON.stringify({ targetStatus: "REJETE" }),
      headers: { "Content-Type": "application/json" },
    });
    await POST(req, { params: Promise.resolve({ id: "abc" }) });
    expect(requireApiAuthMock).toHaveBeenCalledWith(
      req,
      expect.objectContaining({
        rbac: { resource: "DOSSIERS", action: "REJECT" },
      }),
    );
  });
});
