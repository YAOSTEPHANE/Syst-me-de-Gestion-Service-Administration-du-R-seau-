import { describe, expect, it } from "vitest";

import { canTransitionGrattageContrat } from "@/lib/lonaci/grattage-contrats";

describe("canTransitionGrattageContrat", () => {
  it("autorise la suspension depuis EN COURS", () => {
    expect(canTransitionGrattageContrat("AGENT", "EN_COURS", "SUSPENDU")).toBe(true);
  });

  it("refuse la reprise après résiliation", () => {
    expect(canTransitionGrattageContrat("AGENT", "RESILIE", "EN_COURS")).toBe(false);
  });

  it("autorise le chef de service à résilier", () => {
    expect(canTransitionGrattageContrat("CHEF_SERVICE", "EN_COURS", "RESILIE")).toBe(true);
  });
});
