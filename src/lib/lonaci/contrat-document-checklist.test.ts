import { describe, expect, it } from "vitest";

import { CONTRAT_CHECKLIST_DEFAULT_ITEMS } from "@/lib/lonaci/contrat-checklist-defaults";
import {
  mergeContratChecklistTemplate,
  mergeProductDossierAndAnnexeTemplates,
} from "@/lib/lonaci/produit-document-checklist";
import type { ProduitDocument } from "@/lib/lonaci/types";

const produits: ProduitDocument[] = [
  {
    code: "LOTO",
    libelle: "Loto",
    actif: true,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    documentsChecklist: [{ id: "cni", libelle: "CNI", obligatoire: true }],
    documentsAnnexe: [{ id: "reg_loto", libelle: "Règlement LOTO", obligatoire: true }],
  },
];

describe("documents signature de contrat", () => {
  it("définit 6 pièces communes par défaut", () => {
    expect(CONTRAT_CHECKLIST_DEFAULT_ITEMS).toHaveLength(6);
    expect(CONTRAT_CHECKLIST_DEFAULT_ITEMS.map((i) => i.id)).toContain("contrat_piece_identite");
    expect(CONTRAT_CHECKLIST_DEFAULT_ITEMS.map((i) => i.id)).toContain("contrat_formulaire_demande");
  });

  it("fusionne pièces communes + produit + annexe", () => {
    const merged = mergeContratChecklistTemplate(
      ["LOTO"],
      produits,
      null,
      CONTRAT_CHECKLIST_DEFAULT_ITEMS,
    );
    expect(merged.map((i) => i.id)).toEqual([
      ...CONTRAT_CHECKLIST_DEFAULT_ITEMS.map((i) => i.id),
      "cni",
      "reg_loto",
    ]);
    const productOnly = mergeProductDossierAndAnnexeTemplates(["LOTO"], produits);
    expect(productOnly.map((i) => i.id)).toEqual(["cni", "reg_loto"]);
  });

  it("déduplique si une pièce commune porte le même id qu’un produit", () => {
    const merged = mergeContratChecklistTemplate(
      ["LOTO"],
      produits,
      null,
      [{ id: "cni", libelle: "CNI commune", obligatoire: true }],
    );
    expect(merged.filter((i) => i.id === "cni")).toHaveLength(1);
    expect(merged.find((i) => i.id === "cni")?.libelle).toBe("CNI commune");
  });
});
