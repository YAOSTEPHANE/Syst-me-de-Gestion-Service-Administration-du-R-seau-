import { describe, expect, it } from "vitest";

import { CESSION_STATUTS_SPEC_54 } from "@/lib/lonaci/cession-statut-metier-constants";
import { resolveCessionStatutMetier } from "@/lib/lonaci/cession-statut-metier";

describe("statut métier de cession", () => {
  it("expose les cinq statuts métier", () => {
    expect(CESSION_STATUTS_SPEC_54).toHaveLength(5);
    expect(CESSION_STATUTS_SPEC_54[0]?.label).toBe("EN CONSTITUTION");
    expect(CESSION_STATUTS_SPEC_54[4]?.label).toBe("CESSION FINALISÉE");
  });

  it("distingue constitution et dossier complet", () => {
    expect(
      resolveCessionStatutMetier({
        kind: "CESSION",
        statut: "SAISIE_AGENT",
        checklistComplet: false,
      }),
    ).toBe("EN_CONSTITUTION");
    expect(
      resolveCessionStatutMetier({
        kind: "CESSION",
        statut: "SAISIE_AGENT",
        checklistComplet: true,
      }),
    ).toBe("DOSSIER_COMPLET");
  });

  it("retourne EN VALIDATION dans le circuit", () => {
    expect(
      resolveCessionStatutMetier({ kind: "CESSION", statut: "CONTROLE_CHEF_SECTION" }),
    ).toBe("EN_VALIDATION");
    expect(resolveCessionStatutMetier({ kind: "CESSION", statut: "VALIDATION_N2" })).toBe(
      "EN_VALIDATION",
    );
  });

  it("priorise ACTE GÉNÉRÉ avant finalisation", () => {
    expect(
      resolveCessionStatutMetier({
        kind: "CESSION",
        statut: "VALIDATION_N2",
        acteGenereAt: "2026-05-01T12:00:00.000Z",
      }),
    ).toBe("ACTE_GENERE");
  });

  it("retourne CESSION FINALISÉE après validation finale", () => {
    expect(
      resolveCessionStatutMetier({
        kind: "CESSION",
        statut: "VALIDEE_CHEF_SERVICE",
        acteGenereAt: "2026-05-01T12:00:00.000Z",
      }),
    ).toBe("CESSION_FINALISEE");
  });
});
