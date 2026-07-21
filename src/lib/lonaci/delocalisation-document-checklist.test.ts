import { describe, expect, it } from "vitest";

import {
  DELOCALISATION_CHECKLIST_ITEMS_SPEC_61,
  mergeDelocalisationChecklistTemplate,
} from "@/lib/lonaci/delocalisation-document-checklist";
import { buildDocumentChecklistForKind } from "@/lib/lonaci/cession-dossier-checklist";

describe("liste des pièces de délocalisation", () => {
  it("inclut les 4 pièces communes", () => {
    expect(DELOCALISATION_CHECKLIST_ITEMS_SPEC_61).toHaveLength(4);
  });

  it("fusionne les documents produit", () => {
    const template = mergeDelocalisationChecklistTemplate("LOTO", [
      {
        _id: "p1",
        code: "LOTO",
        libelle: "Loto",
        actif: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        documentsChecklist: [{ id: "rib", libelle: "RIB", obligatoire: true }],
      },
    ]);
    expect(template.length).toBeGreaterThan(4);
  });
});

describe("liste des pièces de cession-délocalisation", () => {
  it("combine cession et délocalisation", () => {
    const checklist = buildDocumentChecklistForKind("CESSION_DELOCALISATION", "LOTO", [
      {
        _id: "p1",
        code: "LOTO",
        libelle: "Loto",
        actif: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        documentsChecklist: [],
      },
    ]);
    expect(checklist.entries.length).toBeGreaterThanOrEqual(8);
    const ids = checklist.entries.map((e) => e.itemId);
    expect(ids).toContain("cession_formulaire_signe");
    expect(ids).toContain("deloc_formulaire_signe");
  });
});
