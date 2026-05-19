import { describe, expect, it } from "vitest";

import {
  RESILIATION_CHECKLIST_ITEMS_SPEC_71,
  buildResiliationDocumentChecklist,
  mergeResiliationChecklistTemplate,
} from "@/lib/lonaci/resiliation-document-checklist";

describe("résiliation document checklist spec 7.1", () => {
  it("inclut les 5 pièces communes", () => {
    expect(RESILIATION_CHECKLIST_ITEMS_SPEC_71).toHaveLength(5);
    expect(RESILIATION_CHECKLIST_ITEMS_SPEC_71.map((i) => i.id)).toContain("resiliation_demande_signee");
    expect(RESILIATION_CHECKLIST_ITEMS_SPEC_71.map((i) => i.id)).toContain("resiliation_restitution_materiel");
  });

  it("fusionne les documents produit configurables", () => {
    const template = mergeResiliationChecklistTemplate("LOTO", [
      {
        _id: "p1",
        code: "LOTO",
        libelle: "Loto",
        actif: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        documentsChecklist: [{ id: "pv_reception", libelle: "PV de réception matériel", obligatoire: true }],
      },
    ]);
    expect(template.length).toBeGreaterThan(5);
    expect(template.some((t) => t.id === "produit_pv_reception")).toBe(true);
  });

  it("initialise une checklist avec statuts EN_ATTENTE", () => {
    const checklist = buildResiliationDocumentChecklist("LOTO", []);
    expect(checklist.entries.length).toBeGreaterThanOrEqual(5);
    expect(checklist.complet).toBe(false);
    expect(checklist.entries.every((e) => e.statut === "EN_ATTENTE")).toBe(true);
  });
});
