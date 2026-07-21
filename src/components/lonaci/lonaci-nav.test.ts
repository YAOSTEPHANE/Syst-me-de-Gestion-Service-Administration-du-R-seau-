import { describe, expect, it } from "vitest";

import { LONACI_NAV, isLonaciNavItemActive } from "@/components/lonaci/lonaci-nav";

describe("isLonaciNavItemActive", () => {
  it("active la route exacte et ses sous-routes", () => {
    expect(isLonaciNavItemActive("/dossiers", "/dossiers")).toBe(true);
    expect(isLonaciNavItemActive("/dossiers/123/historique", "/dossiers")).toBe(true);
  });

  it("n'active pas les préfixes partiels", () => {
    expect(isLonaciNavItemActive("/dossiers-archives", "/dossiers")).toBe(false);
  });

  it("active aussi les sous-routes du tableau de bord", () => {
    expect(isLonaciNavItemActive("/dashboard", "/dashboard")).toBe(true);
    expect(isLonaciNavItemActive("/dashboard/indicateurs", "/dashboard")).toBe(true);
  });
});

describe("LONACI_NAV", () => {
  it("associe une icône explicite à chaque entrée", () => {
    expect(LONACI_NAV.every((item) => typeof item.icon === "object" || typeof item.icon === "function")).toBe(true);
  });

  it("présente les modules dans l'ordre du circuit de traitement", () => {
    expect(LONACI_NAV.map((item) => item.href)).toEqual([
      "/dashboard",
      "/clients",
      "/dossiers",
      "/cautions",
      "/concessionnaires",
      "/contrats",
      "/agrements",
      "/pdv-integrations",
      "/attestations-domiciliation",
      "/bancarisation",
      "/cessions",
      "/resiliations",
      "/succession",
      "/gpr",
      "/contrats-grattage",
      "/dispatcher",
      "/registres",
      "/carte-pdv",
      "/rapports",
      "/alertes",
      "/assistant-operations",
      "/import",
      "/parametres",
    ]);
  });
});
