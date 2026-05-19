import { describe, expect, it } from "vitest";

import {
  CESSION_CHECKLIST_ITEMS_SPEC_52,
  buildCessionDocumentChecklist,
  mergeCessionChecklistTemplate,
} from "@/lib/lonaci/cession-document-checklist";
import { computeChecklistProgress } from "@/lib/lonaci/produit-document-checklist";

describe("cession document checklist spec 5.2", () => {
  it("inclut les 4 pièces communes", () => {
    expect(CESSION_CHECKLIST_ITEMS_SPEC_52).toHaveLength(4);
    expect(CESSION_CHECKLIST_ITEMS_SPEC_52.map((i) => i.id)).toContain("cession_identite_parties");
    expect(CESSION_CHECKLIST_ITEMS_SPEC_52.map((i) => i.id)).toContain("cession_formulaire_signe");
  });

  it("ajoute les documents du référentiel produit", () => {
    const template = mergeCessionChecklistTemplate("LOTO", [
      {
        _id: "p1",
        code: "LOTO",
        libelle: "Loto",
        actif: true,
        documentsChecklist: [{ id: "rib", libelle: "RIB bancaire", obligatoire: true }],
      },
    ]);
    expect(template.length).toBeGreaterThan(4);
    expect(template.some((t) => t.id === "produit_rib")).toBe(true);
  });

  it("calcule la progression en temps réel", () => {
    const checklist = buildCessionDocumentChecklist("LOTO", []);
    const statuts = Object.fromEntries(
      checklist.entries.map((e, i) => [e.itemId, i === 0 ? ("FOURNI" as const) : ("EN_ATTENTE" as const)]),
    );
    const p = computeChecklistProgress(checklist.entries, statuts);
    expect(p.obligatoiresTotal).toBeGreaterThan(0);
    expect(p.obligatoiresFournis).toBe(1);
    expect(p.complet).toBe(false);
  });

  it("calcule complet quand toutes les pièces obligatoires sont fournies", () => {
    const checklist = buildCessionDocumentChecklist("LOTO", []);
    const filled = {
      ...checklist,
      entries: checklist.entries.map((e) => ({ ...e, statut: "FOURNI" as const })),
      complet: true,
    };
    expect(filled.complet).toBe(true);
  });
});
