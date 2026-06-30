import { describe, expect, it } from "vitest";

import { userCanAccessRegistry } from "./lonaci-registries";
import type { LonaciRegistryDocument } from "./lonaci-registries";
import type { UserDocument } from "./types";

function user(partial: Partial<UserDocument>): UserDocument {
  return {
    email: "a@test.com",
    passwordHash: "x",
    nom: "Test",
    prenom: "User",
    role: "AGENT",
    actif: true,
    agenceId: "agence-a",
    agencesAutorisees: [],
    modulesAutorises: [],
    produitsAutorises: [],
    ...partial,
  } as UserDocument;
}

function registry(agenceId: string | null): LonaciRegistryDocument {
  return {
    _id: "reg-1",
    module: "AGREMENT",
    reference: "AGR-000001",
    titre: "Test",
    concessionnaireId: null,
    agenceId,
    statut: "RECU",
    commentaire: null,
    meta: {},
    createdByUserId: "u1",
    updatedByUserId: "u1",
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };
}

describe("userCanAccessRegistry", () => {
  it("autorise un agent sur son agence", () => {
    expect(userCanAccessRegistry(user({ agenceId: "agence-a" }), registry("agence-a"))).toBe(true);
  });

  it("refuse un agent sur une autre agence", () => {
    expect(userCanAccessRegistry(user({ agenceId: "agence-a" }), registry("agence-b"))).toBe(false);
  });

  it("autorise un chef de service national", () => {
    expect(
      userCanAccessRegistry(user({ role: "CHEF_SERVICE", agenceId: null }), registry("agence-b")),
    ).toBe(true);
  });
});
