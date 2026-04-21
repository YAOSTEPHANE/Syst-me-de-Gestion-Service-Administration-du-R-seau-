import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireApiAuthMock, ensureUsersIndexesMock, listUsersMock } = vi.hoisted(() => ({
  requireApiAuthMock: vi.fn(),
  ensureUsersIndexesMock: vi.fn(),
  listUsersMock: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({
  requireApiAuth: requireApiAuthMock,
}));

vi.mock("@/lib/lonaci/users", () => ({
  ensureUsersIndexes: ensureUsersIndexesMock,
  listUsers: listUsersMock,
  findUserByEmail: vi.fn(),
  findUserByMatricule: vi.fn(),
  createUser: vi.fn(),
  sanitizeUser: (u: unknown) => u,
}));

import { GET } from "./route";

describe("GET /api/admin/users", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireApiAuthMock.mockResolvedValue({ user: { _id: "admin-1", role: "CHEF_SERVICE" } });
    ensureUsersIndexesMock.mockResolvedValue(undefined);
    listUsersMock.mockResolvedValue([
      {
        id: "u1",
        email: "alpha@lonaci.ci",
        nom: "Alpha",
        prenom: "A",
        matricule: "MAT001",
        role: "AGENT",
        agenceId: "ag-1",
        actif: true,
      },
      {
        id: "u2",
        email: "beta@lonaci.ci",
        nom: "Beta",
        prenom: "B",
        matricule: "MAT002",
        role: "CHEF_SECTION",
        agenceId: "ag-1",
        actif: false,
      },
      {
        id: "u3",
        email: "gamma@lonaci.ci",
        nom: "Gamma",
        prenom: "C",
        matricule: "MAT003",
        role: "AGENT",
        agenceId: "ag-2",
        actif: true,
      },
    ]);
  });

  it("applique les filtres et la pagination", async () => {
    const req = new NextRequest(
      "http://localhost:3000/api/admin/users?status=ACTIF&role=AGENT&agenceId=ag-1&q=alpha&page=1&pageSize=10",
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { users: Array<{ id: string }>; pagination: { total: number; totalPages: number } };
    expect(body.users.map((u) => u.id)).toEqual(["u1"]);
    expect(body.pagination.total).toBe(1);
    expect(body.pagination.totalPages).toBe(1);
  });

  it("rejette un pageSize invalide", async () => {
    const req = new NextRequest("http://localhost:3000/api/admin/users?pageSize=0");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });
});
