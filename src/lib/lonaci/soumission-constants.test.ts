import { describe, expect, it } from "vitest";

import { canMarkSoumissionNonAppele, harmonizeSoumissionAppel } from "@/lib/lonaci/soumission-constants";

describe("harmonizeSoumissionAppel", () => {
  it("coche « Appelé » dès qu'un statut autre que « À appeler » est choisi", () => {
    expect(harmonizeSoumissionAppel({ statut: "A_APPELER", appele: false }, { statut: "SANS_SUITE" })).toEqual({
      statut: "SANS_SUITE",
      appele: true,
    });
    expect(harmonizeSoumissionAppel(null, { statut: "EN_COURS", appele: false })).toEqual({
      statut: "EN_COURS",
      appele: true,
    });
  });

  it("passe « À appeler » en « En cours » quand on marque « Appelé »", () => {
    expect(harmonizeSoumissionAppel({ statut: "A_APPELER", appele: false }, { appele: true })).toEqual({
      statut: "EN_COURS",
      appele: true,
    });
    expect(harmonizeSoumissionAppel(null, { statut: "A_APPELER", appele: true })).toEqual({
      statut: "EN_COURS",
      appele: true,
    });
  });

  it("revient à « À appeler » quand on décoche « Appelé » sur « En cours »", () => {
    expect(
      harmonizeSoumissionAppel({ statut: "EN_COURS", appele: true }, { statut: "EN_COURS", appele: false }),
    ).toEqual({ statut: "A_APPELER", appele: false });
  });

  it("garde « Appelé » au-delà de « En cours »", () => {
    expect(harmonizeSoumissionAppel({ statut: "CONVERTI", appele: true }, { appele: false })).toEqual({
      statut: "CONVERTI",
      appele: true,
    });
    expect(canMarkSoumissionNonAppele("EN_ATTENTE_PAIEMENT")).toBe(false);
    expect(canMarkSoumissionNonAppele("EN_COURS")).toBe(true);
  });

  it("laisse « À appeler » + « Appelé » quand on repasse à rappeler", () => {
    expect(
      harmonizeSoumissionAppel({ statut: "EN_COURS", appele: true }, { statut: "A_APPELER", appele: true }),
    ).toEqual({ statut: "A_APPELER", appele: true });
  });

  it("ne change rien à une création « À appeler » non appelée", () => {
    expect(harmonizeSoumissionAppel(null, { statut: "A_APPELER", appele: false })).toEqual({
      statut: "A_APPELER",
      appele: false,
    });
  });
});
