import { beforeEach, describe, expect, it, vi } from "vitest";

const { insertOneMock, listActiveUsersByRoleMock } = vi.hoisted(() => ({
  insertOneMock: vi.fn(),
  listActiveUsersByRoleMock: vi.fn(),
}));

vi.mock("@/lib/mongodb", () => ({
  getDatabase: vi.fn(async () => ({
    collection: vi.fn(() => ({
      insertOne: insertOneMock,
    })),
  })),
}));

vi.mock("@/lib/lonaci/users", () => ({
  listActiveUsersByRole: listActiveUsersByRoleMock,
}));

import { notifyRoleTargets } from "@/lib/lonaci/notifications";

describe("notifications de workflow par agence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listActiveUsersByRoleMock.mockResolvedValue([
      { _id: "n1-a", role: "CHEF_SECTION", agenceId: "ag-a", agencesAutorisees: [] },
      { _id: "n1-b", role: "CHEF_SECTION", agenceId: "ag-b", agencesAutorisees: [] },
      {
        _id: "n1-multi",
        role: "CHEF_SECTION",
        agenceId: null,
        agencesAutorisees: ["ag-a", "ag-c"],
      },
    ]);
    insertOneMock.mockResolvedValue({ insertedId: "notification-id" });
  });

  it("cible uniquement le rôle responsable dans le périmètre agence", async () => {
    await notifyRoleTargets(
      "CHEF_SECTION",
      "Validation attendue",
      "Dossier à valider",
      { dossierId: "d1" },
      "ag-a",
    );

    expect(insertOneMock).toHaveBeenCalledTimes(2);
    expect(insertOneMock.mock.calls.map(([row]) => row.userId)).toEqual([
      "n1-a",
      "n1-multi",
    ]);
  });
});
