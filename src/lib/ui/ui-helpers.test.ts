import { describe, expect, it } from "vitest";

import { cn } from "@/lib/ui/cn";
import { getPaginationItems } from "@/lib/ui/pagination";

describe("cn", () => {
  it("assemble uniquement les classes actives", () => {
    expect(cn("base", false, undefined, "active", null)).toBe("base active");
  });
});

describe("getPaginationItems", () => {
  it("garde les bornes et condense les pages éloignées", () => {
    expect(getPaginationItems(5, 10)).toEqual([1, "ellipsis", 4, 5, 6, "ellipsis", 10]);
  });

  it("borne la page courante", () => {
    expect(getPaginationItems(99, 3)).toEqual([1, 2, 3]);
  });

  it("retourne une liste vide sans page", () => {
    expect(getPaginationItems(1, 0)).toEqual([]);
  });
});
