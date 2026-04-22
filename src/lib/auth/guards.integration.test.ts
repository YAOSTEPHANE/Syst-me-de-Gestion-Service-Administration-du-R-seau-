import assert from "node:assert";

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getSessionFromRequestMock,
  clearCurrentSessionMock,
  findUserByIdMock,
  setUserCurrentSessionMock,
  touchSessionActivityMock,
} = vi.hoisted(() => ({
  getSessionFromRequestMock: vi.fn(),
  clearCurrentSessionMock: vi.fn(),
  findUserByIdMock: vi.fn(),
  setUserCurrentSessionMock: vi.fn(),
  touchSessionActivityMock: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getSessionFromRequest: getSessionFromRequestMock,
}));

vi.mock("@/lib/lonaci/users", () => ({
  clearCurrentSession: clearCurrentSessionMock,
  findUserById: findUserByIdMock,
  setUserCurrentSession: setUserCurrentSessionMock,
  touchSessionActivity: touchSessionActivityMock,
}));

import { requireApiAuth } from "./guards";

function makeBaseUser(overrides?: Record<string, unknown>) {
  return {
    _id: "u1",
    role: "AGENT",
    actif: true,
    currentSessionId: "s1",
    lastActivityAt: new Date(),
    agenceId: null,
    agencesAutorisees: [],
    modulesAutorises: [],
    produitsAutorises: [],
    ...overrides,
  };
}

describe("requireApiAuth module authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionFromRequestMock.mockResolvedValue({ sub: "u1", sessionId: "s1" });
    clearCurrentSessionMock.mockResolvedValue(undefined);
    setUserCurrentSessionMock.mockResolvedValue(undefined);
    touchSessionActivityMock.mockResolvedValue(undefined);
  });

  it("autorise /api/contrats avec module ADMIN seul", async () => {
    findUserByIdMock.mockResolvedValue(
      makeBaseUser({
        modulesAutorises: ["ADMIN"],
      }),
    );

    const req = new NextRequest("http://localhost:3000/api/contrats");
    const result = await requireApiAuth(req);

    expect("error" in result).toBe(false);
    if ("error" in result) {
      throw new Error("Unexpected auth error");
    }
    expect(result.user._id).toBe("u1");
    expect(touchSessionActivityMock).toHaveBeenCalledWith("u1");
  });

  it("refuse /api/contrats sans ADMIN ni CONTRATS", async () => {
    findUserByIdMock.mockResolvedValue(
      makeBaseUser({
        modulesAutorises: ["REPORTS"],
      }),
    );

    const req = new NextRequest("http://localhost:3000/api/contrats");
    const result = await requireApiAuth(req);

    expect("error" in result).toBe(true);
    if ("error" in result) {
      assert(result.error);
      expect(result.error.status).toBe(403);
    } else {
      throw new Error("Expected auth error");
    }
  });

  it("applique RBAC: refuse creation cautions pour SUPERVISEUR_REGIONAL", async () => {
    findUserByIdMock.mockResolvedValue(
      makeBaseUser({
        role: "SUPERVISEUR_REGIONAL",
        modulesAutorises: ["CAUTIONS"],
      }),
    );

    const req = new NextRequest("http://localhost:3000/api/cautions", { method: "POST" });
    const result = await requireApiAuth(req);

    expect("error" in result).toBe(true);
    if ("error" in result) {
      assert(result.error);
      expect(result.error.status).toBe(403);
    } else {
      throw new Error("Expected RBAC denial");
    }
  });

  it("applique RBAC: autorise lecture cautions pour SUPERVISEUR_REGIONAL", async () => {
    findUserByIdMock.mockResolvedValue(
      makeBaseUser({
        role: "SUPERVISEUR_REGIONAL",
        modulesAutorises: ["CAUTIONS"],
      }),
    );

    const req = new NextRequest("http://localhost:3000/api/cautions", { method: "GET" });
    const result = await requireApiAuth(req);

    expect("error" in result).toBe(false);
    if ("error" in result) {
      throw new Error("Unexpected RBAC denial");
    }
  });

  it("applique un override RBAC explicite", async () => {
    findUserByIdMock.mockResolvedValue(
      makeBaseUser({
        role: "AGENT",
        modulesAutorises: ["REPORTS"],
      }),
    );

    const req = new NextRequest("http://localhost:3000/api/reports/summary", { method: "GET" });
    const result = await requireApiAuth(req, {
      rbac: { resource: "REPORTS", action: "CONFIGURE" },
    });

    expect("error" in result).toBe(true);
    if ("error" in result) {
      assert(result.error);
      expect(result.error.status).toBe(403);
    } else {
      throw new Error("Expected RBAC override denial");
    }
  });
});
