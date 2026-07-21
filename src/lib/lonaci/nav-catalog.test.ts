import { describe, expect, it } from "vitest";

import {
  LONACI_NAV_CATALOG,
  getDefaultMenuOrder,
  mergeMenuOrder,
  resolveInheritedNavSections,
  toMenuOrder,
  validateMenuOrder,
} from "@/lib/lonaci/nav-catalog";

describe("ordre global du menu", () => {
  it("résout la section héritée de chaque module", () => {
    const resolved = resolveInheritedNavSections(LONACI_NAV_CATALOG);
    expect(
      resolved.find((item) => item.href === "/dossiers")?.resolvedSection,
    ).toBe("Parcours");
    expect(
      resolved.find((item) => item.href === "/registres")?.resolvedSection,
    ).toBe("Opérations");
  });

  it("applique un ordre stocké sans changer l'ordre des sections", () => {
    const stored = getDefaultMenuOrder(LONACI_NAV_CATALOG).map((section) =>
      section.section === "Parcours"
        ? { ...section, hrefs: [...section.hrefs].reverse() }
        : section,
    );
    const merged = toMenuOrder(mergeMenuOrder(LONACI_NAV_CATALOG, stored));
    const parcours = merged.find((section) => section.section === "Parcours");
    expect(parcours?.hrefs[0]).toBe("/bancarisation");
    expect(merged.map((section) => section.section)).toEqual([
      "Principal",
      "Parcours",
      "Opérations",
      "Pilotage",
      "Administration",
    ]);
  });

  it("ajoute les nouveaux modules manquants à la fin de leur section", () => {
    const catalog = [
      { href: "/a", section: "A" },
      { href: "/b" },
      { href: "/nouveau" },
    ];
    const merged = mergeMenuOrder(catalog, [
      { section: "A", hrefs: ["/b", "/a"] },
    ]);
    expect(merged.map((item) => item.href)).toEqual([
      "/b",
      "/a",
      "/nouveau",
    ]);
  });

  it("refuse doublons, hrefs inconnues et déplacements inter-section", () => {
    const issues = validateMenuOrder(
      [
        {
          section: "Principal",
          hrefs: ["/dashboard", "/dashboard", "/clients", "/inconnu"],
        },
      ],
      LONACI_NAV_CATALOG,
    );
    expect(issues.map((issue) => issue.message)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("plusieurs fois"),
        expect.stringContaining("appartient à la section Parcours"),
        expect.stringContaining("Module inconnu"),
      ]),
    );
  });

  it("ignore sans danger les données stockées corrompues", () => {
    const merged = mergeMenuOrder(LONACI_NAV_CATALOG, [
      { section: "Principal", hrefs: ["/clients", "/inconnu"] },
    ]);
    expect(merged.map((item) => item.href)).toEqual(
      LONACI_NAV_CATALOG.map((item) => item.href),
    );
  });
});
