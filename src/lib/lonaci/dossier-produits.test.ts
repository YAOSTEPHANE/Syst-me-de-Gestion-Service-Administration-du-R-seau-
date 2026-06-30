import { describe, expect, it } from "vitest";

import {
  getDossierProduitCodes,
  serializeDossierProduitPayload,
} from "@/lib/lonaci/dossier-produits";

describe("dossier-produits", () => {
  it("lit produitCodes quand présent", () => {
    expect(
      getDossierProduitCodes({
        produitCode: "LOTO",
        produitCodes: ["LOTO", "PMU"],
      }),
    ).toEqual(["LOTO", "PMU"]);
  });

  it("retombe sur produitCode seul", () => {
    expect(getDossierProduitCodes({ produitCode: "pmu" })).toEqual(["PMU"]);
  });

  it("sérialise produitCode et produitCodes", () => {
    expect(serializeDossierProduitPayload(["pmu", "LOTO", "PMU"])).toEqual({
      produitCode: "PMU",
      produitCodes: ["PMU", "LOTO"],
    });
  });
});
