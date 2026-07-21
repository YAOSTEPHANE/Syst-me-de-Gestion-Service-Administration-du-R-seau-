import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireApiAuthMock,
  ensureDossierIndexesMock,
  patchContratDossierPayloadMock,
  buildDossierContratStatutMetierFieldsMock,
} = vi.hoisted(() => ({
  requireApiAuthMock: vi.fn(),
  ensureDossierIndexesMock: vi.fn(),
  patchContratDossierPayloadMock: vi.fn(),
  buildDossierContratStatutMetierFieldsMock: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({
  requireApiAuth: requireApiAuthMock,
}));

vi.mock("@/lib/lonaci/dossiers", () => ({
  ensureDossierIndexes: ensureDossierIndexesMock,
  findDossierById: vi.fn(async () => null),
  findVisibleDossierById: vi.fn(async () => ({ _id: "d1", status: "BROUILLON" })),
  patchContratDossierPayload: patchContratDossierPayloadMock,
  buildDossierContratStatutMetierFields: buildDossierContratStatutMetierFieldsMock,
}));

import { expectResponse } from "@/test-utils/expect-response";

import { PATCH } from "./route";

describe("PATCH /api/dossiers/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireApiAuthMock.mockResolvedValue({ user: { _id: "u1", role: "AGENT", agenceId: "a1" } });
    ensureDossierIndexesMock.mockResolvedValue(undefined);
    buildDossierContratStatutMetierFieldsMock.mockResolvedValue({});
  });

  it("rejette un corps vide (aucun champ)", async () => {
    const req = new NextRequest("http://localhost:3000/api/dossiers/x1", {
      method: "PATCH",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "x1" }) });
    expectResponse(res);
    expect(res.status).toBe(400);
    expect(patchContratDossierPayloadMock).not.toHaveBeenCalled();
  });

  it("appelle patchContratDossierPayload et renvoie le dossier sérialisé", async () => {
    const actedAt = new Date("2026-01-15T10:00:00.000Z");
    patchContratDossierPayloadMock.mockResolvedValue({
      _id: "d1",
      type: "CONTRAT_ACTUALISATION",
      reference: "DOS-00000001",
      status: "BROUILLON",
      concessionnaireId: "c1",
      agenceId: "a1",
      payload: { produitCode: "LOTO", observations: "ok" },
      history: [
        {
          status: "BROUILLON",
          actedByUserId: "u0",
          actedAt,
          comment: null,
        },
      ],
      createdByUserId: "u0",
      updatedByUserId: "u1",
      createdAt: actedAt,
      updatedAt: actedAt,
      deletedAt: null,
    });

    const req = new NextRequest("http://localhost:3000/api/dossiers/d1", {
      method: "PATCH",
      body: JSON.stringify({ observations: "ok" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "d1" }) });
    expectResponse(res);
    expect(res.status).toBe(200);
    expect(patchContratDossierPayloadMock).toHaveBeenCalledWith("d1", { observations: "ok" }, expect.any(Object));
    const body = (await res.json()) as { dossier: { id: string; payload: Record<string, unknown> } };
    expect(body.dossier.id).toBe("d1");
    expect(body.dossier.payload.observations).toBe("ok");
  });
});
