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
  it("n'autorise N2 qu'après Validé N1", () => {
    expect(dossierEtapeAllowsAction("SOUMIS", "VALIDATE_N2")).toBe(false);
    expect(dossierEtapeAllowsAction("VALIDE_N1", "VALIDATE_N2")).toBe(true);
    expect(dossierEtapeAllowsAction("VALIDE_N1", "VALIDATE_N1")).toBe(false);
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

describe("validation dossier — approvals désactivées", () => {
  it("garde le flag désactivé", () => {
    expect(WORKFLOW_APPROVALS_ENABLED).toBe(false);
  });

  it("ouvre N1 / N2 / finalisation aux rôles opérationnels selon l'étape", () => {
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

    expect(listDossierTransitionActionsForUi("CHEF_SERVICE", "SOUMIS")).toContain("VALIDATE_N1");
    expect(listDossierTransitionActionsForUi("AGENT", "VALIDE_N1")).toContain("VALIDATE_N2");
    expect(listDossierTransitionActionsForUi("ASSIST_CDS", "VALIDE_N2")).toContain("FINALIZE");
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

  it("enchaîne le parcours SOUMIS → VALIDE_N1 → VALIDE_N2 → finalisable pour un même rôle ops", () => {
    const etapes: Array<{
      etape: string;
      action: "VALIDATE_N1" | "VALIDATE_N2" | "FINALIZE";
    }> = [
      { etape: "SOUMIS", action: "VALIDATE_N1" },
      { etape: "VALIDE_N1", action: "VALIDATE_N2" },
      { etape: "VALIDE_N2", action: "FINALIZE" },
    ];

    for (const { etape, action } of etapes) {
      expect(userCanPerformDossierTransitionAtEtape("AGENT", etape, action)).toBe(true);
      expect(userCanApproveDossierAtEtape("AGENT", etape)).toBe(true);
      expect(dossierEtapeAllowsAction(etape, action)).toBe(true);
    }

    expect(dossierEtapeAllowsAction("FINALISE", "FINALIZE")).toBe(false);
    expect(listDossierTransitionActionsForUi("CHEF_SERVICE", "FINALISE")).not.toContain("FINALIZE");
  });
});
