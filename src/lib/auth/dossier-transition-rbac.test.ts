import { describe, expect, it } from "vitest";

import {
  dossierEtapeAllowsAction,
  listDossierBulkActionsForUi,
  listDossierTransitionActionsForUi,
  userCanApproveDossierAtEtape,
  userCanPerformDossierTransitionAtEtape,
} from "@/lib/auth/dossier-transition-rbac";
import {
  dossierTransitionRoleError,
  WORKFLOW_SEPARATION_ERRORS,
} from "@/lib/lonaci/workflow-separation";

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

  it("retire les actions du valideur après la validation de son niveau", () => {
    const chefSectionAfterN1 = listDossierTransitionActionsForUi("CHEF_SECTION", "VALIDE_N1");
    expect(chefSectionAfterN1).not.toContain("REJECT");
    expect(chefSectionAfterN1).not.toContain("RETURN_PREVIOUS");

    const assistantAfterN2 = listDossierTransitionActionsForUi("ASSIST_CDS", "VALIDE_N2");
    expect(assistantAfterN2).not.toContain("REJECT");
    expect(assistantAfterN2).not.toContain("RETURN_PREVIOUS");
  });

  it("ne propose qu'une décision négative au valideur de l'étape courante", () => {
    const atN1 = listDossierTransitionActionsForUi("CHEF_SECTION", "SOUMIS");
    expect(atN1).toContain("REJECT");
    expect(atN1).not.toContain("RETURN_PREVIOUS");

    const atN2 = listDossierTransitionActionsForUi("ASSIST_CDS", "VALIDE_N1");
    expect(atN2).not.toContain("REJECT");
    expect(atN2).toContain("RETURN_PREVIOUS");

    const atFinalization = listDossierTransitionActionsForUi("CHEF_SERVICE", "VALIDE_N2");
    expect(atFinalization).not.toContain("REJECT");
    expect(atFinalization).toContain("RETURN_PREVIOUS");
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

describe("validation dossier contrat — niveaux N1, N2, finalisation", () => {
  it("niveau N1 (Soumis) : seul le chef de section peut approuver", () => {
    expect(userCanApproveDossierAtEtape("CHEF_SECTION", "SOUMIS")).toBe(true);
    expect(userCanApproveDossierAtEtape("ASSIST_CDS", "SOUMIS")).toBe(false);
    expect(userCanApproveDossierAtEtape("CHEF_SERVICE", "SOUMIS")).toBe(false);
    expect(userCanApproveDossierAtEtape("AGENT", "SOUMIS")).toBe(false);

    expect(listDossierTransitionActionsForUi("CHEF_SECTION", "SOUMIS")).toContain("VALIDATE_N1");
    expect(listDossierTransitionActionsForUi("CHEF_SERVICE", "SOUMIS")).not.toContain("VALIDATE_N1");
  });

  it("niveau N2 (Validé N1) : seul l'assistant CDS peut approuver", () => {
    expect(userCanApproveDossierAtEtape("ASSIST_CDS", "VALIDE_N1")).toBe(true);
    expect(userCanApproveDossierAtEtape("CHEF_SECTION", "VALIDE_N1")).toBe(false);
    expect(userCanApproveDossierAtEtape("CHEF_SERVICE", "VALIDE_N1")).toBe(false);

    expect(listDossierTransitionActionsForUi("ASSIST_CDS", "VALIDE_N1")).toContain("VALIDATE_N2");
    expect(listDossierTransitionActionsForUi("CHEF_SECTION", "VALIDE_N1")).not.toContain("VALIDATE_N2");
    expect(listDossierTransitionActionsForUi("CHEF_SERVICE", "VALIDE_N1")).not.toContain("VALIDATE_N2");
  });

  it("finalisation (Validé N2) : seul le chef de service peut approuver", () => {
    expect(userCanApproveDossierAtEtape("CHEF_SERVICE", "VALIDE_N2")).toBe(true);
    expect(userCanApproveDossierAtEtape("ASSIST_CDS", "VALIDE_N2")).toBe(false);
    expect(userCanApproveDossierAtEtape("CHEF_SECTION", "VALIDE_N2")).toBe(false);

    expect(listDossierTransitionActionsForUi("CHEF_SERVICE", "VALIDE_N2")).toContain("FINALIZE");
    expect(listDossierTransitionActionsForUi("ASSIST_CDS", "VALIDE_N2")).not.toContain("FINALIZE");
  });

  it("refuse côté métier les rôles hors périmètre à chaque niveau", () => {
    expect(dossierTransitionRoleError("CHEF_SERVICE", "VALIDE_N1")).toBe(
      WORKFLOW_SEPARATION_ERRORS.DOSSIER_N1_CHEF_SECTION_ONLY,
    );
    expect(dossierTransitionRoleError("CHEF_SECTION", "VALIDE_N2")).toBe(
      WORKFLOW_SEPARATION_ERRORS.DOSSIER_N2_ASSIST_CDS_ONLY,
    );
    expect(dossierTransitionRoleError("ASSIST_CDS", "FINALISE")).toBe(
      WORKFLOW_SEPARATION_ERRORS.DOSSIER_FINALIZE_CHEF_SERVICE_ONLY,
    );
  });

  it("enchaîne le parcours complet SOUMIS → VALIDE_N1 → VALIDE_N2 → finalisable", () => {
    const etapes: Array<{
      etape: string;
      approbateur: string;
      action: "VALIDATE_N1" | "VALIDATE_N2" | "FINALIZE";
    }> = [
      { etape: "SOUMIS", approbateur: "CHEF_SECTION", action: "VALIDATE_N1" },
      { etape: "VALIDE_N1", approbateur: "ASSIST_CDS", action: "VALIDATE_N2" },
      { etape: "VALIDE_N2", approbateur: "CHEF_SERVICE", action: "FINALIZE" },
    ];

    for (const { etape, approbateur, action } of etapes) {
      expect(userCanPerformDossierTransitionAtEtape(approbateur, etape, action)).toBe(true);
      expect(userCanApproveDossierAtEtape(approbateur, etape)).toBe(true);
      expect(dossierEtapeAllowsAction(etape, action)).toBe(true);
    }

    expect(dossierEtapeAllowsAction("FINALISE", "FINALIZE")).toBe(false);
    expect(listDossierTransitionActionsForUi("CHEF_SERVICE", "FINALISE")).not.toContain("FINALIZE");
  });
});
