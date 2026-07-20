import { describe, expect, it } from "vitest";

import {
  DECHARGE_DEFINITIVE_MENTION,
  DECHARGE_DEFINITIVE_TITLE,
  dossierEligibleDechargeDefinitive,
  DECHARGE_CONTRAT_TITLE,
  dossierEligibleDechargeContratRemise,
} from "@/lib/lonaci/dossier-decharge-constants";

describe("dossierEligibleDechargeDefinitive", () => {
  const checklistComplete = { entries: [{ id: "1" }], complet: true };
  const checklistIncomplete = { entries: [{ id: "1" }], complet: false };

  it("exige checklist complète, caution payée et référence de paiement", () => {
    expect(dossierEligibleDechargeDefinitive(checklistComplete, true, true)).toBe(true);
    expect(dossierEligibleDechargeDefinitive(checklistIncomplete, true, true)).toBe(false);
    expect(dossierEligibleDechargeDefinitive(checklistComplete, false, true)).toBe(false);
    expect(dossierEligibleDechargeDefinitive(checklistComplete, true, false)).toBe(false);
    expect(dossierEligibleDechargeDefinitive({ entries: [], complet: true }, true, true)).toBe(false);
  });

  it("expose les libellés officiels de la décharge définitive", () => {
    expect(DECHARGE_DEFINITIVE_TITLE).toBe("DÉCHARGE DÉFINITIVE — DOSSIER COMPLET");
    expect(DECHARGE_DEFINITIVE_MENTION).toBe("DOSSIER COMPLET");
  });
});

describe("dossierEligibleDechargeContratRemise", () => {
  it("exige dossier finalisé et contrat généré", () => {
    expect(dossierEligibleDechargeContratRemise("FINALISE", true)).toBe(true);
    expect(dossierEligibleDechargeContratRemise("VALIDE_N2", true)).toBe(false);
    expect(dossierEligibleDechargeContratRemise("FINALISE", false)).toBe(false);
  });

  it("expose le titre de la fiche remise client", () => {
    expect(DECHARGE_CONTRAT_TITLE).toBe("FICHE DE DÉCHARGE — REMISE DU CONTRAT AU CLIENT");
  });
});
