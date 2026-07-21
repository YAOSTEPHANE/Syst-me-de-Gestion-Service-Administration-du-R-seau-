import { describe, expect, it } from "vitest";

describe("circuit de traitement des attestations", () => {
  it("définit 6 étapes du circuit", async () => {
    const { ATTESTATION_CIRCUIT_ETAPES } = await import("@/lib/lonaci/constants");
    expect(ATTESTATION_CIRCUIT_ETAPES.map((e) => e.step)).toEqual([11, 12, 13, 14, 15, 16]);
  });
});
