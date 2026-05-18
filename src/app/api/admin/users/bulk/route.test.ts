import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireApiAuthMock, clearCurrentSessionsMock, setUsersActiveStateMock } = vi.hoisted(() => ({
  requireApiAuthMock: vi.fn(),
  clearCurrentSessionsMock: vi.fn(),
  setUsersActiveStateMock: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({
  requireApiAuth: requireApiAuthMock,
}));

vi.mock("@/lib/lonaci/users", () => ({
  clearCurrentSessions: clearCurrentSessionsMock,
  setUsersActiveState: setUsersActiveStateMock,
}));

import { expectResponse } from "@/test-utils/expect-response";

import { POST } from "./route";

describe("POST /api/admin/users/bulk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireApiAuthMock.mockResolvedValue({ user: { _id: "admin-1", role: "CHEF_SERVICE" } });
    clearCurrentSessionsMock.mockResolvedValue(2);
    setUsersActiveStateMock.mockResolvedValue(2);
  });

  it("force les déconnexions en masse", async () => {
    const req = new NextRequest("http://localhost:3000/api/admin/users/bulk", {
      method: "POST",
      body: JSON.stringify({ action: "FORCE_LOGOUT", ids: ["u1", "u2"] }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expectResponse(res);
    expect(res.status).toBe(200);
    expect(clearCurrentSessionsMock).toHaveBeenCalledWith(["u1", "u2"]);
  });

  it("refuse la désactivation de son propre compte", async () => {
    const req = new NextRequest("http://localhost:3000/api/admin/users/bulk", {
      method: "POST",
      body: JSON.stringify({ action: "DEACTIVATE", ids: ["admin-1"] }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expectResponse(res);
    expect(res.status).toBe(400);
    expect(setUsersActiveStateMock).not.toHaveBeenCalled();
  });
});
