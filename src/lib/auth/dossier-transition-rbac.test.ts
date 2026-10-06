import { describe, expect, it } from "vitest";

import {
  dossierEtapeAllowsAction,
  listDossierBulkActionsForUi,
  listDossierTransitionActionsForUi,
  userCanApproveDossierAtEtape,
  userCanPerformDossierTransitionAtEtape,
} from "@/lib/auth/dossier-transition-rbac";
import { dossierTransitionRoleError } from "@/lib/lonaci/workflow-separation";
import { WORKFLOW_APPROVALS_ENABLED } from "@/lib/lonaci/workflow-approvals";

describe("dossier-transition-rbac étape métier", () => {
  it("n'expose plus d'étape N1 / N2 : finalisation directe depuis Soumis et les anciens statuts", () => {
    for (const etape of ["SOUMIS", "VALIDE_N1", "VALIDE_N2"]) {
      expect(dossierEtapeAllowsAction(etape, "VALIDATE_N1")).toBe(false);
      expect(dossierEtapeAllowsAction(etape, "VALIDATE_N2")).toBe(false);
      expect(dossierEtapeAllowsAction(etape, "FINALIZE")).toBe(true);
    }
  });

  it("filtre le bulk par statut liste", () => {
    for (const etape of ["SOUMIS", "VALIDE_N1"]) {
      const actions = listDossierBulkActionsForUi("CHEF_SECTION", etape);
      expect(actions).toContain("FINALIZE");
      expect(actions).not.toContain("VALIDATE_N1");
      expect(actions).not.toContain("VALIDATE_N2");
    }
  });
});

describe("validation dossier — approvals désactivées", () => {
  it("garde le flag désactivé", () => {
    expect(WORKFLOW_APPROVALS_ENABLED).toBe(false);
  });

  it("ouvre la finalisation aux rôles opérationnels à toute étape non finale", () => {
    expect(userCanApproveDossierAtEtape("CHEF_SECTION", "SOUMIS")).toBe(true);
    expect(userCanApproveDossierAtEtape("ASSIST_CDS", "SOUMIS")).toBe(true);
    expect(userCanApproveDossierAtEtape("CHEF_SERVICE", "SOUMIS")).toBe(true);
    expect(userCanApproveDossierAtEtape("AGENT", "SOUMIS")).toBe(true);

    expect(userCanApproveDossierAtEtape("CHEF_SECTION", "VALIDE_N1")).toBe(true);
    expect(userCanApproveDossierAtEtape("ASSIST_CDS", "VALIDE_N1")).toBe(true);
    expect(userCanApproveDossierAtEtape("CHEF_SERVICE", "VALIDE_N1")).toBe(true);

    expect(userCanApproveDossierAtEtape("CHEF_SERVICE", "VALIDE_N2")).toBe(true);
    expect(userCanApproveDossierAtEtape("ASSIST_CDS", "VALIDE_N2")).toBe(true);
    expect(userCanApproveDossierAtEtape("CHEF_SECTION", "VALIDE_N2")).toBe(true);
    expect(userCanApproveDossierAtEtape("AGENT", "VALIDE_N2")).toBe(true);

    expect(listDossierTransitionActionsForUi("CHEF_SERVICE", "SOUMIS")).toContain("FINALIZE");
    expect(listDossierTransitionActionsForUi("AGENT", "VALIDE_N1")).toContain("FINALIZE");
    expect(listDossierTransitionActionsForUi("ASSIST_CDS", "VALIDE_N2")).toContain("FINALIZE");
    expect(listDossierTransitionActionsForUi("CHEF_SERVICE", "SOUMIS")).not.toContain("VALIDATE_N1");
  });

  it("autorise le rejet / retour pour les rôles opérationnels selon l'étape", () => {
    expect(userCanPerformDossierTransitionAtEtape("CHEF_SECTION", "SOUMIS", "REJECT")).toBe(true);
    expect(
      userCanPerformDossierTransitionAtEtape("ASSIST_CDS", "VALIDE_N1", "RETURN_PREVIOUS"),
    ).toBe(true);
  });

  it("n'applique plus les erreurs de séparation de rôles", () => {
    expect(dossierTransitionRoleError("CHEF_SERVICE", "VALIDE_N1")).toBeNull();
    expect(dossierTransitionRoleError("CHEF_SECTION", "VALIDE_N2")).toBeNull();
    expect(dossierTransitionRoleError("ASSIST_CDS", "FINALISE")).toBeNull();
  });

  it("permet à un même rôle ops de finaliser en un clic depuis Soumis ou un ancien statut N1 / N2", () => {
    for (const etape of ["SOUMIS", "VALIDE_N1", "VALIDE_N2"]) {
      expect(userCanPerformDossierTransitionAtEtape("AGENT", etape, "FINALIZE")).toBe(true);
      expect(userCanApproveDossierAtEtape("AGENT", etape)).toBe(true);
      expect(dossierEtapeAllowsAction(etape, "FINALIZE")).toBe(true);
    }

    expect(dossierEtapeAllowsAction("FINALISE", "FINALIZE")).toBe(false);
    expect(listDossierTransitionActionsForUi("CHEF_SERVICE", "FINALISE")).not.toContain("FINALIZE");
  });
});
