import { describe, expect, it } from "vitest";

import {
  dossierTransitionRoleError,
  inscriptionTransitionRoleError,
  rbacWorkflowDenialMessage,
  WORKFLOW_SEPARATION_ERRORS,
} from "@/lib/lonaci/workflow-separation";

describe("workflow-separation", () => {
  it("réserve N1 dossier au chef de section", () => {
    expect(dossierTransitionRoleError("CHEF_SERVICE", "VALIDE_N1")).toBe(
      WORKFLOW_SEPARATION_ERRORS.DOSSIER_N1_CHEF_SECTION_ONLY,
    );
    expect(dossierTransitionRoleError("ASSIST_CDS", "VALIDE_N1")).toBe(
      WORKFLOW_SEPARATION_ERRORS.DOSSIER_N1_CHEF_SECTION_ONLY,
    );
  });

  it("réserve N2 dossier à l'assistant CDS", () => {
    expect(dossierTransitionRoleError("CHEF_SERVICE", "VALIDE_N2")).toBe(
      WORKFLOW_SEPARATION_ERRORS.DOSSIER_N2_ASSIST_CDS_ONLY,
    );
    expect(dossierTransitionRoleError("CHEF_SECTION", "VALIDE_N2")).toBe(
      WORKFLOW_SEPARATION_ERRORS.DOSSIER_N2_ASSIST_CDS_ONLY,
    );
  });

  it("réserve la finalisation au chef de service", () => {
    expect(dossierTransitionRoleError("ASSIST_CDS", "FINALISE")).toBe(
      WORKFLOW_SEPARATION_ERRORS.DOSSIER_FINALIZE_CHEF_SERVICE_ONLY,
    );
  });

  it("interdit N1 inscription PDV au chef de service", () => {
    expect(inscriptionTransitionRoleError("VALIDATE_N1", "CHEF_SERVICE", "SOUMIS")).toBe(
      WORKFLOW_SEPARATION_ERRORS.INSCRIPTION_N1_CHEF_SECTION_ONLY,
    );
    expect(inscriptionTransitionRoleError("REJECT", "CHEF_SERVICE", "SOUMIS")).toBe(
      WORKFLOW_SEPARATION_ERRORS.INSCRIPTION_REJECT_N1_CHEF_SECTION_ONLY,
    );
  });

  it("expose un message RBAC explicite pour le chef de service sur N2", () => {
    const msg = rbacWorkflowDenialMessage("CHEF_SERVICE", "DOSSIERS", "VALIDATE_N2");
    expect(msg).toContain("assistant");
    expect(msg).toContain("finalise");
  });
});
