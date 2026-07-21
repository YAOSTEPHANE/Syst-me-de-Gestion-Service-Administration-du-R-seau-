import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LONACI_NAV, LonaciNavIcon } from "@/components/lonaci/lonaci-nav";

describe("navigation principale", () => {
  it("possède des libellés et chemins uniques", () => {
    const labels = LONACI_NAV.map((item) => item.label);
    const paths = LONACI_NAV.map((item) => item.href);
    expect(new Set(labels).size).toBe(labels.length);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("masque les icônes décoratives aux technologies d'assistance", () => {
    render(
      <span data-testid="icon">
        <LonaciNavIcon icon={LONACI_NAV[0].icon} color={LONACI_NAV[0].iconColor} />
      </span>,
    );
    const icon = screen.getByTestId("icon").querySelector("svg");
    expect(icon?.getAttribute("aria-hidden")).toBe("true");
    expect(icon?.getAttribute("style")).toContain("color");
  });
});
