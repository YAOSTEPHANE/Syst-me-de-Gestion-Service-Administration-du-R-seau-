import { describe, expect, it } from "vitest";

import {
  isSoumissionCircuitClos,
  resolveSoumissionCircuitActions,
  resolveSoumissionCircuitAffichage,
  soumissionCurrentMonthStart,
  soumissionOverdueThreshold,
} from "@/lib/lonaci/soumission-circuit";

const NOW = new Date("2026-10-15T09:00:00.000Z");

describe("resolveSoumissionCircuitAffichage", () => {
  it("passe en retard au-delà de J+10 tant que le circuit est ouvert", () => {
    expect(
      resolveSoumissionCircuitAffichage({
        circuitStatut: "EN_ATTENTE",
        circuitStartedAt: "2026-10-05T09:00:00.000Z",
        now: NOW,
      }),
    ).toBe("EN_RETARD");
    expect(
      resolveSoumissionCircuitAffichage({
        circuitStatut: "A_CORRIGER",
        circuitStartedAt: "2026-10-06T09:00:00.000Z",
        now: NOW,
      }),
    ).toBe("A_CORRIGER");
  });

  it("ne marque jamais en retard un circuit clos ou non démarré", () => {
    expect(
      resolveSoumissionCircuitAffichage({
        circuitStatut: "PAYEE",
        circuitStartedAt: "2026-01-01T00:00:00.000Z",
        now: NOW,
      }),
    ).toBe("PAYEE");
    expect(
      resolveSoumissionCircuitAffichage({ circuitStatut: null, circuitStartedAt: null, now: NOW }),
    ).toBeNull();
  });

  it("calcule le seuil J+10 et le début de mois", () => {
    expect(soumissionOverdueThreshold(NOW).toISOString()).toBe("2026-10-05T09:00:00.000Z");
    expect(soumissionCurrentMonthStart(NOW).toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });
});

describe("resolveSoumissionCircuitActions", () => {
  it("réserve la finalisation au chef de service en mode hiérarchique", () => {
    const agent = resolveSoumissionCircuitActions({
      role: "AGENT",
      circuitStatut: "EN_ATTENTE",
      approvalsEnabled: true,
    });
    expect(agent).toMatchObject({ ficheCaisse: true, finaliser: false, correction: false, exonerer: false });

    const chef = resolveSoumissionCircuitActions({
      role: "CHEF_SERVICE",
      circuitStatut: "EN_ATTENTE",
      approvalsEnabled: true,
    });
    expect(chef).toMatchObject({ finaliser: true, correction: true, exonerer: true, renvoyer: false });
  });

  it("ouvre la finalisation aux rôles opérationnels en mode simplifié, sauf l'exonération", () => {
    expect(
      resolveSoumissionCircuitActions({
        role: "AGENT",
        circuitStatut: "EN_ATTENTE",
        approvalsEnabled: false,
      }),
    ).toMatchObject({ finaliser: true, correction: true, exonerer: false });
    expect(
      resolveSoumissionCircuitActions({
        role: "AUDITEUR",
        circuitStatut: "EN_ATTENTE",
        approvalsEnabled: false,
      }),
    ).toMatchObject({ ficheCaisse: false, finaliser: false });
  });

  it("permet de renvoyer une soumission à corriger et bloque la fiche caisse une fois clos", () => {
    expect(
      resolveSoumissionCircuitActions({ role: "AGENT", circuitStatut: "A_CORRIGER", approvalsEnabled: true }),
    ).toMatchObject({ renvoyer: true, finaliser: false, ficheCaisse: true });
    expect(
      resolveSoumissionCircuitActions({ role: "AGENT", circuitStatut: "PAYEE", approvalsEnabled: true }),
    ).toMatchObject({ ficheCaisse: false, ficheDefinitive: true });
    expect(isSoumissionCircuitClos("EXONEREE")).toBe(true);
    expect(isSoumissionCircuitClos("A_CORRIGER")).toBe(false);
  });
});
