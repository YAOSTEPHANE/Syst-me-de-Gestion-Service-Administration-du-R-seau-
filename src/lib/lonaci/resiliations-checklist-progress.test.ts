import { describe, expect, it } from "vitest";

import { resiliationChecklistProgress } from "@/lib/lonaci/resiliations-checklist-progress";

describe("resiliationChecklistProgress", () => {
  it("calcule DOSSIER INCOMPLET tant que des pièces manquent", () => {
    const progress = resiliationChecklistProgress({
      entries: [
        { itemId: "a", libelle: "A", obligatoire: true, statut: "FOURNI" },
        { itemId: "b", libelle: "B", obligatoire: true, statut: "EN_ATTENTE" },
      ],
      complet: false,
    });
    expect(progress.complet).toBe(false);
    expect(progress.obligatoiresFournis).toBe(1);
    expect(progress.obligatoiresTotal).toBe(2);
  });

  it("calcule DOSSIER COMPLET quand tout est fourni", () => {
    const progress = resiliationChecklistProgress({
      entries: [
        { itemId: "a", libelle: "A", obligatoire: true, statut: "FOURNI" },
        { itemId: "b", libelle: "B", obligatoire: true, statut: "FOURNI" },
      ],
      complet: true,
    });
    expect(progress.complet).toBe(true);
    expect(progress.obligatoiresFournis).toBe(2);
  });
});
