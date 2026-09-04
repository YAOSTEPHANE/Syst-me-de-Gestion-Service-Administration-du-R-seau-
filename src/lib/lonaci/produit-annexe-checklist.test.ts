import { describe, expect, it } from "vitest";

import {
  filterChecklistItemsByClientCategorie,
  mergeContratChecklistTemplate,
  mergeProductAnnexeTemplates,
  mergeProductChecklistTemplates,
  mergeProductDossierAndAnnexeTemplates,
  normalizeChecklistTemplate,
} from "@/lib/lonaci/produit-document-checklist";
import type { ProduitDocument } from "@/lib/lonaci/types";

const produits: ProduitDocument[] = [
  {
    code: "LOTO",
    libelle: "Loto",
    actif: true,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    documentsChecklist: [
      { id: "cni", libelle: "CNI", obligatoire: true },
      {
        id: "rccm",
        libelle: "RCCM",
        obligatoire: true,
        categories: ["ENTREPRISE", "CANAL_ALTERNATIF"],
      },
    ],
    documentsAnnexe: [
      { id: "reg_loto", libelle: "Règlement LOTO", obligatoire: true },
      {
        id: "statuts",
        libelle: "Statuts société",
        obligatoire: true,
        categories: ["ENTREPRISE"],
      },
    ],
  },
];

describe("normalizeChecklistTemplate", () => {
  it("conserve les catégories client", () => {
    const items = normalizeChecklistTemplate([
      { id: "a", libelle: "Pièce A", categories: ["PARTICULIER", "ENTREPRISE"] },
    ]);
    expect(items[0]?.categories).toEqual(["PARTICULIER", "ENTREPRISE"]);
  });
});

describe("filterChecklistItemsByClientCategorie", () => {
  it("garde les pièces sans restriction pour tous", () => {
    const items = normalizeChecklistTemplate(produits[0]!.documentsChecklist);
    expect(filterChecklistItemsByClientCategorie(items, "PARTICULIER").map((i) => i.id)).toEqual([
      "cni",
    ]);
    expect(filterChecklistItemsByClientCategorie(items, "ENTREPRISE").map((i) => i.id)).toEqual([
      "cni",
      "rccm",
    ]);
  });
});

describe("mergeProductAnnexeTemplates", () => {
  it("marque les pièces annexe", () => {
    const items = mergeProductAnnexeTemplates(["LOTO"], produits);
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.annexe)).toBe(true);
  });

  it("filtre selon le type de client", () => {
    const particulier = mergeProductAnnexeTemplates(["LOTO"], produits, "PARTICULIER");
    expect(particulier.map((i) => i.id)).toEqual(["reg_loto"]);
    const entreprise = mergeProductAnnexeTemplates(["LOTO"], produits, "ENTREPRISE");
    expect(entreprise.map((i) => i.id)).toEqual(["reg_loto", "statuts"]);
  });
});

describe("mergeProductChecklistTemplates", () => {
  it("filtre les pièces caution selon le type de client", () => {
    expect(mergeProductChecklistTemplates(["LOTO"], produits, "PARTICULIER").map((i) => i.id)).toEqual([
      "cni",
    ]);
    expect(
      mergeProductChecklistTemplates(["LOTO"], produits, "CANAL_ALTERNATIF").map((i) => i.id),
    ).toEqual(["cni", "rccm"]);
  });
});

describe("mergeProductDossierAndAnnexeTemplates", () => {
  it("fusionne dossier et annexe", () => {
    const items = mergeProductDossierAndAnnexeTemplates(["LOTO"], produits);
    expect(items).toHaveLength(4);
    expect(items.some((i) => i.id === "cni" && !i.annexe)).toBe(true);
    expect(items.some((i) => i.id === "reg_loto" && i.annexe)).toBe(true);
  });

  it("fusionne filtrée pour un particulier", () => {
    const items = mergeProductDossierAndAnnexeTemplates(["LOTO"], produits, "PARTICULIER");
    expect(items.map((i) => i.id)).toEqual(["cni", "reg_loto"]);
  });
});

describe("mergeContratChecklistTemplate", () => {
  it("place les pièces communes avant les pièces produit", () => {
    const items = mergeContratChecklistTemplate(
      ["LOTO"],
      produits,
      "PARTICULIER",
      [{ id: "contrat_base", libelle: "Base contrat", obligatoire: true }],
    );
    expect(items.map((i) => i.id)).toEqual(["contrat_base", "cni", "reg_loto"]);
  });
});
