import { describe, expect, it } from "vitest";

import {
  mergeProductAnnexeTemplates,
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

describe("mergeProductAnnexeTemplates", () => {
  it("marque les pièces annexe", () => {
    const items = mergeProductAnnexeTemplates(["LOTO"], produits);
    expect(items).toHaveLength(1);
    expect(items[0]?.annexe).toBe(true);
    expect(items[0]?.libelle).toBe("Règlement LOTO");
  });
});

describe("mergeProductDossierAndAnnexeTemplates", () => {
  it("fusionne dossier et annexe", () => {
    const items = mergeProductDossierAndAnnexeTemplates(["LOTO"], produits);
    expect(items).toHaveLength(2);
    expect(items.some((i) => i.id === "cni" && !i.annexe)).toBe(true);
    expect(items.some((i) => i.id === "reg_loto" && i.annexe)).toBe(true);
  });
});
