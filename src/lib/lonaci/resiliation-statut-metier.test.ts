import { describe, expect, it } from "vitest";

import { RESILIATION_STATUTS_SPEC_72 } from "@/lib/lonaci/resiliation-statut-metier-constants";
import { resolveResiliationStatutMetier } from "@/lib/lonaci/resiliation-statut-metier";

describe("statut métier de résiliation", () => {
  it("expose les quatre statuts métier", () => {
    expect(RESILIATION_STATUTS_SPEC_72).toHaveLength(4);
    expect(RESILIATION_STATUTS_SPEC_72[3]?.label).toBe("RÉSILIÉ");
  });

  it("distingue constitution et dossier complet sur DOSSIER_RECU", () => {
    expect(
      resolveResiliationStatutMetier({ statut: "DOSSIER_RECU", checklistComplet: false }),
    ).toBe("EN_CONSTITUTION");
    expect(
      resolveResiliationStatutMetier({ statut: "DOSSIER_RECU", checklistComplet: true }),
    ).toBe("DOSSIER_COMPLET");
  });

  it("retourne EN VALIDATION dans le circuit N1/N2", () => {
    expect(resolveResiliationStatutMetier({ statut: "CONTROLE_CHEF_SECTION" })).toBe("EN_VALIDATION");
    expect(resolveResiliationStatutMetier({ statut: "VALIDATION_N2" })).toBe("EN_VALIDATION");
  });

  it("retourne RÉSILIÉ après finalisation", () => {
    expect(resolveResiliationStatutMetier({ statut: "RESILIE" })).toBe("RESILIEE");
  });
});
