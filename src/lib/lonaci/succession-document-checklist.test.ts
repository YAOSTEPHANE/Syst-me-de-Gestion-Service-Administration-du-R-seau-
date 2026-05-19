import { describe, expect, it } from "vitest";

import {
  SUCCESSION_CHECKLIST_ITEMS_SPEC_101,
  buildSuccessionDocumentChecklist,
  isSuccessionChecklistComplete,
} from "@/lib/lonaci/succession-document-checklist";

describe("succession document checklist spec 10.1", () => {
  it("contient les 6 pièces de la spec", () => {
    expect(SUCCESSION_CHECKLIST_ITEMS_SPEC_101.length).toBe(6);
    expect(SUCCESSION_CHECKLIST_ITEMS_SPEC_101.map((i) => i.id)).toContain(
      "succession_acte_deces_officiel",
    );
    expect(SUCCESSION_CHECKLIST_ITEMS_SPEC_101.find((i) => i.id === "succession_ohada_complement")?.obligatoire).toBe(
      false,
    );
  });

  it("marque l'acte de décès fourni à la création", () => {
    const checklist = buildSuccessionDocumentChecklist({ acteDecesUploaded: true });
    const acte = checklist.entries.find((e) => e.itemId === "succession_acte_deces_officiel");
    expect(acte?.statut).toBe("FOURNI");
    expect(checklist.complet).toBe(false);
  });

  it("exige toutes les pièces obligatoires pour être complet", () => {
    const checklist = buildSuccessionDocumentChecklist({ acteDecesUploaded: true });
    expect(isSuccessionChecklistComplete(checklist)).toBe(false);
    const complet = {
      entries: checklist.entries.map((e) => ({
        ...e,
        statut: "FOURNI" as const,
      })),
      complet: true,
    };
    expect(isSuccessionChecklistComplete(complet)).toBe(true);
  });
});
