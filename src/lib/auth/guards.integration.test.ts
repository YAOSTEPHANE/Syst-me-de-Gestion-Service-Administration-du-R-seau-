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
  const now = new Date();
  return {
    _id: "u1",
    email: "test@example.com",
    matricule: null,
    passwordHash: "hashed",
    nom: "User",
    prenom: "Test",
    role: "AGENT",
    actif: true,
    currentSessionId: "s1",
    derniereConnexion: null,
    lastActivityAt: now,
    resetPasswordTokenHash: null,
    resetPasswordExpiresAt: null,
    passwordChangedAt: now,
    passwordResetReminderSentForMonth: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
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

  it("autorise CHEF_SERVICE sur /api/contrats même sans le module CONTRATS (liste partielle)", async () => {
    findUserByIdMock.mockResolvedValue(
      makeBaseUser({
        role: "CHEF_SERVICE",
        modulesAutorises: ["REPORTS"],
      }),
    );

    const req = new NextRequest("http://localhost:3000/api/contrats");
    const result = await requireApiAuth(req);

    expect("error" in result).toBe(false);
  });

  it("autorise AUDITEUR sur /api/dashboard/kpi même sans le module DASHBOARD", async () => {
    findUserByIdMock.mockResolvedValue(
      makeBaseUser({
        role: "AUDITEUR",
        modulesAutorises: ["REPORTS"],
      }),
    );

    const req = new NextRequest("http://localhost:3000/api/dashboard/kpi");
    const result = await requireApiAuth(req);

    expect("error" in result).toBe(false);
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

  it("n’applique pas la rotation mensuelle aux rôles non admin (ex. agent)", async () => {
    const start = new Date();
    const old = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1, 0, 0, 0, 0));
    const beforeMonth = new Date(old.getTime() - 86_400_000);
    findUserByIdMock.mockResolvedValue(
      makeBaseUser({
        role: "AGENT",
        passwordChangedAt: beforeMonth,
        createdAt: beforeMonth,
      }),
    );

    const req = new NextRequest("http://localhost:3000/api/contrats", { method: "GET" });
    const result = await requireApiAuth(req);

    expect("error" in result).toBe(false);
  });

  it("bloque l’API métier si rotation mensuelle du mot de passe requise (chef de service)", async () => {
    const start = new Date();
    const old = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1, 0, 0, 0, 0));
    const beforeMonth = new Date(old.getTime() - 86_400_000);
    findUserByIdMock.mockResolvedValue(
      makeBaseUser({
        role: "CHEF_SERVICE",
        passwordChangedAt: beforeMonth,
        createdAt: beforeMonth,
      }),
    );

    const req = new NextRequest("http://localhost:3000/api/contrats", { method: "GET" });
    const result = await requireApiAuth(req);

    expect("error" in result).toBe(true);
    if ("error" in result) {
      assert(result.error);
      expect(result.error.status).toBe(403);
      const body = (await result.error.json()) as { code?: string };
      expect(body.code).toBe("PASSWORD_ROTATION_REQUIRED");
    }
  });

  it("autorise /api/referentials malgré la rotation requise (catalogue lecture seule)", async () => {
    const start = new Date();
    const old = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1, 0, 0, 0, 0));
    const beforeMonth = new Date(old.getTime() - 86_400_000);
    findUserByIdMock.mockResolvedValue(
      makeBaseUser({
        role: "CHEF_SERVICE",
        passwordChangedAt: beforeMonth,
        createdAt: beforeMonth,
        modulesAutorises: [],
      }),
    );

    const req = new NextRequest("http://localhost:3000/api/referentials", { method: "GET" });
    const result = await requireApiAuth(req);

    expect("error" in result).toBe(false);
  });

  it("autorise /api/auth/me malgré la rotation requise", async () => {
    const start = new Date();
    const old = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1, 0, 0, 0, 0));
    const beforeMonth = new Date(old.getTime() - 86_400_000);
    findUserByIdMock.mockResolvedValue(
      makeBaseUser({
        role: "CHEF_SERVICE",
        passwordChangedAt: beforeMonth,
        createdAt: beforeMonth,
        modulesAutorises: [],
      }),
    );

    const req = new NextRequest("http://localhost:3000/api/auth/me", { method: "GET" });
    const result = await requireApiAuth(req);

    expect("error" in result).toBe(false);
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
