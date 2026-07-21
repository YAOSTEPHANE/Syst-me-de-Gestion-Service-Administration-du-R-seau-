import { describe, expect, it } from "vitest";

import { DELOCALISATION_STATUTS_SPEC_63 } from "@/lib/lonaci/delocalisation-statut-metier-constants";
import { resolveDelocalisationStatutMetier } from "@/lib/lonaci/delocalisation-statut-metier";
import { cessionOperationDisplayStatutFields } from "@/lib/lonaci/cession-operation-statut-metier";

describe("statut métier de délocalisation", () => {
  it("expose les quatre statuts métier", () => {
    expect(DELOCALISATION_STATUTS_SPEC_63).toHaveLength(4);
    expect(DELOCALISATION_STATUTS_SPEC_63[0]?.label).toBe("EN CONSTITUTION");
    expect(DELOCALISATION_STATUTS_SPEC_63[3]?.label).toBe("DÉLOCALISATION EFFECTIVE");
  });

  it("distingue constitution et dossier complet", () => {
    expect(
      resolveDelocalisationStatutMetier({
        statut: "SAISIE_AGENT",
        checklistComplet: false,
      }),
    ).toBe("EN_CONSTITUTION");
    expect(
      resolveDelocalisationStatutMetier({
        statut: "SAISIE_AGENT",
        checklistComplet: true,
      }),
    ).toBe("DOSSIER_COMPLET");
  });

  it("retourne EN VALIDATION au contrôle chef de section", () => {
    expect(
      resolveDelocalisationStatutMetier({ statut: "CONTROLE_CHEF_SECTION" }),
    ).toBe("EN_VALIDATION");
  });

  it("retourne DÉLOCALISATION EFFECTIVE après validation finale", () => {
    expect(
      resolveDelocalisationStatutMetier({ statut: "VALIDEE_CHEF_SERVICE" }),
    ).toBe("DELOCALISATION_EFFECTIVE");
  });

  it("route l'affichage délocalisation via cessionOperationDisplayStatutFields", () => {
    const fields = cessionOperationDisplayStatutFields({
      kind: "DELOCALISATION",
      statut: "SAISIE_AGENT",
      checklistComplet: true,
    });
    expect(fields.statutMetierLabel).toBe("DOSSIER COMPLET");
    expect(fields.statutMetierDescription).toContain("Prêt pour validation");
  });
});
