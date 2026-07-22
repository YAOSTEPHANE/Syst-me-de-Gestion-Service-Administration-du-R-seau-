import { describe, expect, it } from "vitest";

import {
  isClientStatutEligibleForContrat,
  isClientStatutEligibleForPromotionConcessionnaire,
} from "./client-constants";

describe("parcours client → concessionnaire", () => {
  it("seul un client ACTIF peut être promu PDV", () => {
    expect(isClientStatutEligibleForPromotionConcessionnaire("ACTIF")).toBe(true);
    expect(isClientStatutEligibleForPromotionConcessionnaire("DOSSIER_EN_COURS")).toBe(false);
    expect(isClientStatutEligibleForPromotionConcessionnaire("EN_ATTENTE_N1")).toBe(false);
    expect(isClientStatutEligibleForPromotionConcessionnaire("INACTIF")).toBe(false);
  });

  it("un contrat peut viser un client en dossier en cours ou EN_ATTENTE_N1 historique", () => {
    expect(isClientStatutEligibleForContrat("DOSSIER_EN_COURS")).toBe(true);
    expect(isClientStatutEligibleForContrat("ACTIF")).toBe(true);
    expect(isClientStatutEligibleForContrat("EN_ATTENTE_N1")).toBe(true);
  });
});
