import { describe, expect, it } from "vitest";

import {
  CESSION_STATUT_LABELS,
  buildCessionsExportFiltersSummary,
} from "@/lib/lonaci/cessions-export";

describe("cessions export spec 5.3", () => {
  it("résume les filtres pour l'en-tête PDF", () => {
    const summary = buildCessionsExportFiltersSummary({
      kind: "CESSION",
      statut: "VALIDATION_N2",
      produitCode: "LOTO",
      agenceLabel: "Agence Plateau",
      dateFrom: new Date("2026-01-01"),
      dateTo: new Date("2026-01-31"),
    });
    expect(summary).toContain("Demandes de cession");
    expect(summary).toContain("Période");
    expect(summary).toContain("Agence Plateau");
    expect(summary).toContain("LOTO");
    expect(summary).toContain(CESSION_STATUT_LABELS.VALIDATION_N2);
  });
});
