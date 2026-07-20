import { describe, expect, it } from "vitest";

import {
  CLIENT_CATEGORIE_LABELS,
  clientDisplayName,
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
  });
});
