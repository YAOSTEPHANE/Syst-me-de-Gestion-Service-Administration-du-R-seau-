import { describe, expect, it } from "vitest";

import { hasModuleAuthorization } from "./guards";

describe("hasModuleAuthorization", () => {
  it("autorise quand aucun module explicite n'est configuré", () => {
    expect(hasModuleAuthorization(undefined, "CONTRATS")).toBe(true);
    expect(hasModuleAuthorization(null, "CONTRATS")).toBe(true);
    expect(hasModuleAuthorization([], "CONTRATS")).toBe(true);
  });

  it("autorise quand le module métier est présent", () => {
    expect(hasModuleAuthorization(["CONTRATS"], "CONTRATS")).toBe(true);
    expect(hasModuleAuthorization(["DOSSIERS", "CONTRATS"], "CONTRATS")).toBe(true);
  });

  it("autorise quand ADMIN est présent (surcouche globale)", () => {
    expect(hasModuleAuthorization(["ADMIN"], "CONTRATS")).toBe(true);
    expect(hasModuleAuthorization(["ADMIN"], "DOSSIERS")).toBe(true);
    expect(hasModuleAuthorization(["ADMIN", "REPORTS"], "CONTRATS")).toBe(true);
  });

  it("refuse quand ni ADMIN ni module métier ne sont présents", () => {
    expect(hasModuleAuthorization(["REPORTS"], "CONTRATS")).toBe(false);
    expect(hasModuleAuthorization(["CONCESSIONNAIRES"], "DOSSIERS")).toBe(false);
  });
});
