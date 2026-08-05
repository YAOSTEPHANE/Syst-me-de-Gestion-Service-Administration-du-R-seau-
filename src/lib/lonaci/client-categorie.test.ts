import { describe, expect, it } from "vitest";

import {
  CLIENT_CATEGORIE_LABELS,
  clientDisplayName,
  isClientCategorieEntreprise,
  normalizeClientCategorie,
} from "@/lib/lonaci/client-constants";

describe("normalizeClientCategorie", () => {
  it("retourne PARTICULIER par défaut", () => {
    expect(normalizeClientCategorie(undefined)).toBe("PARTICULIER");
    expect(normalizeClientCategorie("")).toBe("PARTICULIER");
    expect(normalizeClientCategorie("inconnu")).toBe("PARTICULIER");
  });

  it("reconnaît ENTREPRISE", () => {
    expect(normalizeClientCategorie("ENTREPRISE")).toBe("ENTREPRISE");
    expect(normalizeClientCategorie(" entreprise ")).toBe("ENTREPRISE");
  });

  it("reconnaît CANAL_ALTERNATIF", () => {
    expect(normalizeClientCategorie("CANAL_ALTERNATIF")).toBe("CANAL_ALTERNATIF");
    expect(normalizeClientCategorie("Canal alternatif")).toBe("CANAL_ALTERNATIF");
    expect(normalizeClientCategorie("canal-alternatif")).toBe("CANAL_ALTERNATIF");
  });
});

describe("isClientCategorieEntreprise", () => {
  it("traite ENTREPRISE et CANAL_ALTERNATIF comme forme entreprise", () => {
    expect(isClientCategorieEntreprise("ENTREPRISE")).toBe(true);
    expect(isClientCategorieEntreprise("CANAL_ALTERNATIF")).toBe(true);
    expect(isClientCategorieEntreprise("PARTICULIER")).toBe(false);
  });
});

describe("clientDisplayName", () => {
  it("affiche le nom complet pour un particulier", () => {
    expect(
      clientDisplayName({
        categorie: "PARTICULIER",
        nomComplet: "Jean Dupont",
        raisonSociale: "Jean Dupont",
      }),
    ).toBe("Jean Dupont");
  });

  it("affiche la raison sociale pour un canal alternatif", () => {
    expect(
      clientDisplayName({
        categorie: "CANAL_ALTERNATIF",
        nomComplet: "Koffi Yao",
        raisonSociale: "Canal Koffi Distribution",
      }),
    ).toBe("Canal Koffi Distribution");
  });

  it("affiche la raison sociale pour une entreprise", () => {
    expect(
      clientDisplayName({
        categorie: "ENTREPRISE",
        nomComplet: "Marie Kouassi",
        raisonSociale: "SARL Edit Services",
      }),
    ).toBe("SARL Edit Services");
  });

  it("retombe sur raison sociale si nom complet absent (particulier)", () => {
    expect(
      clientDisplayName({
        categorie: "PARTICULIER",
        nomComplet: null,
        raisonSociale: "Fallback Nom",
      }),
    ).toBe("Fallback Nom");
  });
});

describe("CLIENT_CATEGORIE_LABELS", () => {
  it("couvre toutes les catégories", () => {
    expect(CLIENT_CATEGORIE_LABELS.PARTICULIER).toBe("Particulier");
    expect(CLIENT_CATEGORIE_LABELS.ENTREPRISE).toBe("Entreprise");
    expect(CLIENT_CATEGORIE_LABELS.CANAL_ALTERNATIF).toBe("Canal alternatif");
  });
});

describe("listes séparées", () => {
  it("sépare particuliers et forme entreprise", async () => {
    const {
      CLIENT_CATEGORIES_FORME_ENTREPRISE,
      CLIENT_CATEGORIES_FORME_PARTICULIER,
    } = await import("@/lib/lonaci/client-constants");
    expect([...CLIENT_CATEGORIES_FORME_PARTICULIER]).toEqual(["PARTICULIER"]);
    expect([...CLIENT_CATEGORIES_FORME_ENTREPRISE]).toEqual(["ENTREPRISE", "CANAL_ALTERNATIF"]);
  });
});
