import { describe, expect, it } from "vitest";

import { produitMontantCautionReferentiel } from "@/lib/lonaci/produit-constants";

describe("produitMontantCautionReferentiel", () => {
  it("somme prix et prix kit", () => {
    expect(produitMontantCautionReferentiel({ prix: 500_000, prixKit: 50_000 })).toBe(550_000);
  });

  it("traite un kit absent comme 0", () => {
    expect(produitMontantCautionReferentiel({ prix: 100 })).toBe(100);
  });

  it("retourne null si le prix caution est absent", () => {
    expect(produitMontantCautionReferentiel({ prixKit: 50 })).toBeNull();
  });
});
