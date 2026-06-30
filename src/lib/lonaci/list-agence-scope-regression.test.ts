import { describe, expect, it } from "vitest";

import { resolveListAgenceFilter } from "./access";
import { buildConcessionnaireListWhere } from "./concessionnaires";
import { restrictionToMongoAgenceFilter } from "./list-agence-restriction";
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

describe("régressions périmètre liste agence", () => {
  it("multi-agences autorisées sans filtre → restriction $in (pas vue nationale)", () => {
    const scope = resolveListAgenceFilter(
      user({ role: "CHEF_SERVICE", agenceId: null, agencesAutorisees: ["agence-a", "agence-b"] }),
      undefined,
    );
    expect(scope).toEqual({ ok: true, agenceIds: ["agence-a", "agence-b"] });

    const mongo = restrictionToMongoAgenceFilter({ agenceIds: scope.ok ? scope.agenceIds : undefined });
    expect(mongo).toEqual({ $in: ["agence-a", "agence-b"] });

    const where = buildConcessionnaireListWhere({
      scopeAgenceIds: ["agence-a", "agence-b"],
      includeDeleted: false,
    });
    expect(where.agenceId).toEqual({ in: ["agence-a", "agence-b"] });
  });

  it("chef de service national conserve le filtre demandé", () => {
    expect(
      resolveListAgenceFilter(user({ role: "CHEF_SERVICE", agenceId: null }), "agence-x"),
    ).toEqual({ ok: true, agenceId: "agence-x" });
  });
});
