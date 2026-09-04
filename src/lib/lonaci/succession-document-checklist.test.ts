import { describe, expect, it } from "vitest";

import {
  buildSuccessionDocumentChecklist,
  isSuccessionChecklistComplete,
  patchSuccessionDocumentChecklistStatuts,
} from "@/lib/lonaci/succession-document-checklist";
import {
  SUCCESSION_ACTE_DECES_ITEM_ID,
  SUCCESSION_CHECKLIST_DEFAULT_ITEMS,
} from "@/lib/lonaci/succession-checklist-defaults";

describe("succession document checklist", () => {
  it("expose le modèle par défaut (6 pièces)", () => {
    expect(SUCCESSION_CHECKLIST_DEFAULT_ITEMS.length).toBe(6);
    expect(SUCCESSION_CHECKLIST_DEFAULT_ITEMS.map((i) => i.id)).toContain(
      SUCCESSION_ACTE_DECES_ITEM_ID,
    );
    expect(
      SUCCESSION_CHECKLIST_DEFAULT_ITEMS.find((i) => i.id === "succession_ohada_complement")?.obligatoire,
    ).toBe(false);
  });

  it("marque l'acte de décès fourni à l'ouverture", () => {
    const checklist = buildSuccessionDocumentChecklist({ acteDecesUploaded: true });
    const acte = checklist.entries.find((e) => e.itemId === SUCCESSION_ACTE_DECES_ITEM_ID);
    expect(acte?.statut).toBe("FOURNI");
  });

  it("resynchronise avec un nouveau template en conservant les statuts", () => {
    const initial = buildSuccessionDocumentChecklist();
    const patched = patchSuccessionDocumentChecklistStatuts(initial, [
      { itemId: "succession_identite_ayant_droit", statut: "FOURNI" },
    ]);
    const extendedTemplate = [
      ...SUCCESSION_CHECKLIST_DEFAULT_ITEMS,
      { id: "succession_extra", libelle: "Pièce complémentaire", obligatoire: false },
    ];
    const rebuilt = buildSuccessionDocumentChecklist(undefined, extendedTemplate, patched);
    expect(rebuilt.entries).toHaveLength(7);
    expect(rebuilt.entries.find((e) => e.itemId === "succession_identite_ayant_droit")?.statut).toBe(
      "FOURNI",
    );
    expect(rebuilt.entries.find((e) => e.itemId === "succession_extra")?.statut).toBe("EN_ATTENTE");
  });

  it("détecte la checklist complète", () => {
    let checklist = buildSuccessionDocumentChecklist({ acteDecesUploaded: true });
    expect(isSuccessionChecklistComplete(checklist)).toBe(false);
    const patches = checklist.entries
      .filter((e) => e.obligatoire && e.itemId !== SUCCESSION_ACTE_DECES_ITEM_ID)
      .map((e) => ({ itemId: e.itemId, statut: "FOURNI" as const }));
    checklist = patchSuccessionDocumentChecklistStatuts(checklist, patches);
    expect(isSuccessionChecklistComplete(checklist)).toBe(true);
  });
});
