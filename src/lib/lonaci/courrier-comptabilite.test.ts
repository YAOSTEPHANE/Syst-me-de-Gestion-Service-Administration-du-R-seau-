import { describe, expect, it } from "vitest";

import {
  COURRIER_COMPTABILITE_OBJET,
  COURRIER_COMPTABILITE_TITLE,
  cautionEligibleCourrierComptabilite,
} from "@/lib/lonaci/courrier-comptabilite-constants";

describe("cautionEligibleCourrierComptabilite", () => {
  it("exige une fiche définitive émise", () => {
    expect(cautionEligibleCourrierComptabilite("FPD-2026-000001")).toBe(true);
    expect(cautionEligibleCourrierComptabilite("")).toBe(false);
    expect(cautionEligibleCourrierComptabilite(null)).toBe(false);
  });

  it("expose les libellés du courrier comptabilité", () => {
    expect(COURRIER_COMPTABILITE_TITLE).toBe("COURRIER À TRANSMETTRE À VOTRE COMPTABILITÉ");
    expect(COURRIER_COMPTABILITE_OBJET).toBe("Attestation de paiement de caution concessionnaire LONACI");
  });
});
