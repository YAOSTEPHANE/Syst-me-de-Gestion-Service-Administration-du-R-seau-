import { describe, expect, it } from "vitest";

import { resolveListAgenceFilter } from "./access";
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

describe("resolveListAgenceFilter", () => {
  it("force l'agence de rattachement pour un agent", () => {
    expect(resolveListAgenceFilter(user({ agenceId: "agence-a" }), undefined)).toEqual({
      ok: true,
      agenceId: "agence-a",
    });
  });

  it("refuse un agenceId hors périmètre", () => {
    expect(resolveListAgenceFilter(user({ agenceId: "agence-a" }), "agence-b")).toEqual({
      ok: false,
      code: "AGENCE_FORBIDDEN",
    });
  });

  it("autorise le filtre national pour chef de service sans agence", () => {
    expect(
      resolveListAgenceFilter(user({ role: "CHEF_SERVICE", agenceId: null }), "agence-b"),
    ).toEqual({ ok: true, agenceId: "agence-b" });
  });

  it("respecte agencesAutorisees pour un chef de service", () => {
    expect(
      resolveListAgenceFilter(
        user({ role: "CHEF_SERVICE", agenceId: null, agencesAutorisees: ["agence-a"] }),
        "agence-b",
      ),
    ).toEqual({ ok: false, code: "AGENCE_FORBIDDEN" });
    expect(
      resolveListAgenceFilter(
        user({ role: "CHEF_SERVICE", agenceId: null, agencesAutorisees: ["agence-a"] }),
        "agence-a",
      ),
    ).toEqual({ ok: true, agenceId: "agence-a" });
  });

  it("retourne agenceIds pour plusieurs agences autorisées", () => {
    expect(
      resolveListAgenceFilter(
        user({ role: "CHEF_SERVICE", agenceId: null, agencesAutorisees: ["agence-a", "agence-b"] }),
        undefined,
      ),
    ).toEqual({ ok: true, agenceIds: ["agence-a", "agence-b"] });
  });
});
