import { describe, expect, it } from "vitest";

import {
  mapAgrementImportRowFromRecord,
  parseAgrementImportDate,
} from "@/lib/lonaci/agrements-import-map";

describe("mapAgrementImportRowFromRecord", () => {
  it("mappe les en-têtes FR", () => {
    const mapped = mapAgrementImportRowFromRecord({
      "Référence officielle": "AGR-001",
      "Date réception": "2026-01-15",
      Agence: "ABOBO",
      Produit: "LOTO",
      Observations: "ok",
    });
    expect(mapped.referenceOfficielle).toBe("AGR-001");
    expect(mapped.agence).toBe("ABOBO");
    expect(mapped.produitCode).toBe("LOTO");
    expect(mapped.observations).toBe("ok");
  });
});

describe("parseAgrementImportDate", () => {
  it("parse ISO et JJ/MM/AAAA", () => {
    expect(parseAgrementImportDate("2026-07-22")?.getFullYear()).toBe(2026);
    expect(parseAgrementImportDate("22/07/2026")?.getDate()).toBe(22);
    expect(parseAgrementImportDate("")).toBeNull();
  });
});
