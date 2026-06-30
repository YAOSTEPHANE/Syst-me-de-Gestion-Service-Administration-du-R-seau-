import { beforeEach, describe, expect, it, vi } from "vitest";

const { findConcessionnaireBySourceClientId, findLonaciClientById } = vi.hoisted(() => ({
  findConcessionnaireBySourceClientId: vi.fn(),
  findLonaciClientById: vi.fn(),
}));

vi.mock("@/lib/lonaci/client-to-concessionnaire", () => ({
  findConcessionnaireBySourceClientId,
}));

vi.mock("@/lib/lonaci/clients", () => ({
  findLonaciClientById,
}));

import {
  concessionnaireIdForLonaciClient,
  listFilterConcessionnaireId,
  requireConcessionnaireForLonaciClient,
  resolveFormPartyIds,
} from "./client-party-resolve";

describe("client-party-resolve", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("résout un client vers son PDV lié", async () => {
    findConcessionnaireBySourceClientId.mockResolvedValue({ _id: "pdv-1" });
    await expect(concessionnaireIdForLonaciClient("client-1")).resolves.toBe("pdv-1");
  });

  it("resolveFormPartyIds priorise lonaciClientId", async () => {
    findConcessionnaireBySourceClientId.mockResolvedValue({ _id: "pdv-abc" });
    const party = await resolveFormPartyIds({
      lonaciClientId: "client-abc",
      concessionnaireId: "legacy-pdv",
    });
    expect(party).toEqual({ lonaciClientId: "client-abc", concessionnaireId: "pdv-abc" });
  });

  it("resolveFormPartyIds accepte legacy concessionnaireId seul", async () => {
    const party = await resolveFormPartyIds({ concessionnaireId: "pdv-legacy" });
    expect(party).toEqual({ lonaciClientId: null, concessionnaireId: "pdv-legacy" });
    expect(findConcessionnaireBySourceClientId).not.toHaveBeenCalled();
  });

  it("requireConcessionnaireForLonaciClient exige un PDV", async () => {
    findLonaciClientById.mockResolvedValue({ id: "c1" });
    findConcessionnaireBySourceClientId.mockResolvedValue(null);
    await expect(requireConcessionnaireForLonaciClient("c1")).rejects.toThrow("CLIENT_NOT_PROMOTED");
  });

  it("requireConcessionnaireForLonaciClient retourne l’ID PDV", async () => {
    findLonaciClientById.mockResolvedValue({ id: "c2" });
    findConcessionnaireBySourceClientId.mockResolvedValue({ _id: "pdv-2" });
    await expect(requireConcessionnaireForLonaciClient("c2")).resolves.toBe("pdv-2");
  });

  it("listFilterConcessionnaireId traduit lonaciClientId en filtre PDV", async () => {
    findConcessionnaireBySourceClientId.mockResolvedValue({ _id: "pdv-filter" });
    await expect(
      listFilterConcessionnaireId({ lonaciClientId: "client-x" }),
    ).resolves.toBe("pdv-filter");
  });

  it("listFilterConcessionnaireId sans PDV renvoie __none__", async () => {
    findConcessionnaireBySourceClientId.mockResolvedValue(null);
    await expect(listFilterConcessionnaireId({ lonaciClientId: "orphan" })).resolves.toBe("__none__");
  });
});
