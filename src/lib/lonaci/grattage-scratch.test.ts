import { describe, expect, it } from "vitest";

import { canTransitionScratchLot } from "@/lib/lonaci/gpr-grattage";

describe("canTransitionScratchLot", () => {
  it("autorise le dispatcher à attribuer un lot", () => {
    expect(canTransitionScratchLot("DISPATCHER", "GENERE", "ATTRIBUE")).toBe(true);
  });

  it("refuse au dispatcher l'activation N1", () => {
    expect(canTransitionScratchLot("DISPATCHER", "ATTRIBUE", "ACTIF")).toBe(false);
  });

  it("autorise le chef de section à activer", () => {
    expect(canTransitionScratchLot("CHEF_SECTION", "ATTRIBUE", "ACTIF")).toBe(true);
  });
});
