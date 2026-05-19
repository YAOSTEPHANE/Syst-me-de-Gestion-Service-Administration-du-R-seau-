import { describe, expect, it } from "vitest";

import { computeDelaiTraitementClientJours } from "@/lib/lonaci/attestations-domiciliation";

describe("computeDelaiTraitementClientJours", () => {
  it("calcule le délai en jours entre demande et envoi client", () => {
    const dateDemande = new Date("2026-01-01T10:00:00.000Z");
    const sentToClientAt = new Date("2026-01-04T10:00:00.000Z");
    expect(computeDelaiTraitementClientJours(dateDemande, sentToClientAt)).toBe(3);
  });

  it("retourne null si pas encore envoyé au client", () => {
    expect(
      computeDelaiTraitementClientJours(new Date("2026-01-01"), null),
    ).toBeNull();
  });
});
