import { describe, expect, it } from "vitest";

import {
  bancarisationStatutDescription,
  bancarisationStatutLabel,
  normalizeBancarisationStatut,
} from "@/lib/lonaci/bancarisation-statut";

describe("bancarisation statut spec 8.3", () => {
  it("expose les libellés et descriptions métier", () => {
    expect(bancarisationStatutLabel("NON_BANCARISE")).toBe("NON BANCARISÉ");
    expect(bancarisationStatutDescription("BANCARISE")).toContain("Commissions versées");
  });

  it("normalise le legacy EN_COURS + etatRib", () => {
    expect(normalizeBancarisationStatut("EN_COURS", null)).toBe("EN_ATTENTE_RIB");
    expect(normalizeBancarisationStatut("EN_COURS", "RIB_FOURNI")).toBe("RIB_FOURNI");
    expect(normalizeBancarisationStatut("NON_BANCARISE", "EN_ATTENTE_RIB")).toBe("EN_ATTENTE_RIB");
  });

  it("conserve les statuts 8.3", () => {
    expect(normalizeBancarisationStatut("RIB_VALIDE", null)).toBe("RIB_VALIDE");
    expect(normalizeBancarisationStatut("BANCARISE", null)).toBe("BANCARISE");
  });
});
