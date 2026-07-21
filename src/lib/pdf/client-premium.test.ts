import { describe, expect, it } from "vitest";

import { calculateRasterPageSlices } from "./client-premium";

describe("calculateRasterPageSlices", () => {
  it("privilégie une limite de bloc proche de la fin de page", () => {
    expect(calculateRasterPageSlices(2_500, 1_000, [620, 940, 1_540, 1_880])).toEqual([
      { start: 0, end: 940 },
      { start: 940, end: 1_880 },
      { start: 1_880, end: 2_500 },
    ]);
  });

  it("utilise la hauteur maximale sans limite suffisamment proche", () => {
    expect(calculateRasterPageSlices(2_100, 1_000, [200, 1_100])).toEqual([
      { start: 0, end: 1_000 },
      { start: 1_000, end: 2_000 },
      { start: 2_000, end: 2_100 },
    ]);
  });

  it("normalise les limites invalides et termine sans page vide", () => {
    expect(calculateRasterPageSlices(800, 1_000, [Number.NaN, -1, 800, 400, 400])).toEqual([
      { start: 0, end: 800 },
    ]);
  });
});
