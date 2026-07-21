import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getDefaultMenuOrder, LONACI_NAV_CATALOG } from "@/lib/lonaci/nav-catalog";
import { expectResponse } from "@/test-utils/expect-response";

const { requireApiAuthMock, getStoredMenuOrderMock, saveStoredMenuOrderMock } =
  vi.hoisted(() => ({
    requireApiAuthMock: vi.fn(),
    getStoredMenuOrderMock: vi.fn(),
    saveStoredMenuOrderMock: vi.fn(),
  }));

vi.mock("@/lib/auth/guards", () => ({
  requireApiAuth: requireApiAuthMock,
}));

vi.mock("@/lib/lonaci/menu-order-store", () => ({
  getStoredMenuOrder: getStoredMenuOrderMock,
  saveStoredMenuOrder: saveStoredMenuOrderMock,
}));

import { GET, PATCH } from "./route";

const defaultOrder = getDefaultMenuOrder(LONACI_NAV_CATALOG);
const chefService = {
  _id: "chef-1",
  role: "CHEF_SERVICE",
};

describe("/api/menu-order", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireApiAuthMock.mockResolvedValue({ user: chefService });
    getStoredMenuOrderMock.mockResolvedValue({
      order: [],
      updatedAt: null,
      updatedByUserId: "",
    });
    saveStoredMenuOrderMock.mockImplementation(
      async (order: typeof defaultOrder) => ({
        order,
        updatedAt: new Date("2026-07-21T12:00:00.000Z"),
        updatedByUserId: "chef-1",
      }),
    );
  });

  it("exige une authentification pour GET", async () => {
    requireApiAuthMock.mockResolvedValue({
      error: NextResponse.json({ message: "Non authentifie" }, { status: 401 }),
    });
    const response = await GET(
      new NextRequest("http://localhost/api/menu-order"),
    );
    expectResponse(response);
    expect(response.status).toBe(401);
    expect(getStoredMenuOrderMock).not.toHaveBeenCalled();
  });

  it("retourne l'ordre fusionné à tout utilisateur authentifié", async () => {
    requireApiAuthMock.mockResolvedValue({
      user: { _id: "agent-1", role: "AGENT" },
    });
    const response = await GET(
      new NextRequest("http://localhost/api/menu-order"),
    );
    expectResponse(response);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { order: typeof defaultOrder };
    expect(body.order).toEqual(defaultOrder);
    expect(requireApiAuthMock).toHaveBeenCalledWith(
      expect.any(NextRequest),
      { moduleKey: null },
    );
  });

  it("réserve PATCH au CHEF_SERVICE", async () => {
    requireApiAuthMock.mockResolvedValue({
      error: NextResponse.json({ message: "Acces refuse" }, { status: 403 }),
    });
    const response = await PATCH(
      new NextRequest("http://localhost/api/menu-order", {
        method: "PATCH",
        body: JSON.stringify({ order: defaultOrder }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expectResponse(response);
    expect(response.status).toBe(403);
    expect(saveStoredMenuOrderMock).not.toHaveBeenCalled();
    expect(requireApiAuthMock).toHaveBeenCalledWith(
      expect.any(NextRequest),
      { roles: ["CHEF_SERVICE"], moduleKey: null },
    );
  });

  it("exige aussi une authentification pour PATCH", async () => {
    requireApiAuthMock.mockResolvedValue({
      error: NextResponse.json({ message: "Non authentifie" }, { status: 401 }),
    });
    const response = await PATCH(
      new NextRequest("http://localhost/api/menu-order", {
        method: "PATCH",
        body: JSON.stringify({ order: defaultOrder }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expectResponse(response);
    expect(response.status).toBe(401);
    expect(saveStoredMenuOrderMock).not.toHaveBeenCalled();
  });

  it("sauvegarde un ordre valide incomplet après fusion", async () => {
    const partialOrder = defaultOrder.map((section) => ({
      ...section,
      hrefs: section.hrefs.slice(0, -1),
    }));
    const response = await PATCH(
      new NextRequest("http://localhost/api/menu-order", {
        method: "PATCH",
        body: JSON.stringify({ order: partialOrder }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expectResponse(response);
    expect(response.status).toBe(200);
    expect(saveStoredMenuOrderMock).toHaveBeenCalledWith(
      defaultOrder,
      chefService,
    );
  });

  it.each([
    [
      "un doublon",
      [{ section: "Principal", hrefs: ["/dashboard", "/dashboard"] }],
    ],
    [
      "une href inconnue",
      [{ section: "Principal", hrefs: ["/inconnue"] }],
    ],
    [
      "un déplacement inter-section",
      [{ section: "Principal", hrefs: ["/clients"] }],
    ],
  ])("refuse %s", async (_label, order) => {
    const response = await PATCH(
      new NextRequest("http://localhost/api/menu-order", {
        method: "PATCH",
        body: JSON.stringify({ order }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expectResponse(response);
    expect(response.status).toBe(400);
    expect(saveStoredMenuOrderMock).not.toHaveBeenCalled();
    const body = (await response.json()) as { code: string; details: unknown[] };
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.details.length).toBeGreaterThan(0);
  });
});
