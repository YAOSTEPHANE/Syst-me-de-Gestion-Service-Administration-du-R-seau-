import { describe, expect, it } from "vitest";

import {
  dossierEtapeAllowsAction,
  listDossierBulkActionsForUi,
  listDossierTransitionActionsForUi,
  userCanApproveDossierAtEtape,
} from "@/lib/auth/dossier-transition-rbac";

describe("dossier-transition-rbac étape métier", () => {
  it("n'autorise N2 qu'après Validé N1", () => {
    expect(dossierEtapeAllowsAction("SOUMIS", "VALIDATE_N2")).toBe(false);
    expect(dossierEtapeAllowsAction("VALIDE_N1", "VALIDATE_N2")).toBe(true);
    expect(dossierEtapeAllowsAction("VALIDE_N1", "VALIDATE_N1")).toBe(false);
  });

  it("masque N2 à l'assistant si le dossier est encore Soumis", () => {
    expect(listDossierTransitionActionsForUi("ASSIST_CDS", "SOUMIS")).not.toContain("VALIDATE_N2");
    expect(listDossierTransitionActionsForUi("ASSIST_CDS", "VALIDE_N1")).toContain("VALIDATE_N2");
  });

  it("masque N1 au chef de section si le dossier n'est pas Soumis", () => {
    expect(userCanApproveDossierAtEtape("CHEF_SECTION", "VALIDE_N1")).toBe(false);
    expect(userCanApproveDossierAtEtape("CHEF_SECTION", "SOUMIS")).toBe(true);
  });

  it("filtre le bulk par statut liste", () => {
    const atN1 = listDossierBulkActionsForUi("CHEF_SECTION", "SOUMIS");
    expect(atN1).toContain("VALIDATE_N1");
    expect(atN1).not.toContain("VALIDATE_N2");

    const atN2 = listDossierBulkActionsForUi("ASSIST_CDS", "VALIDE_N1");
    expect(atN2).toContain("VALIDATE_N2");
    expect(atN2).not.toContain("VALIDATE_N1");
  });
});
