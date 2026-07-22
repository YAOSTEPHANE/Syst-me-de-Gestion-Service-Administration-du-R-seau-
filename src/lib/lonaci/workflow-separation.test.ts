import { describe, expect, it } from "vitest";

import {
  dossierTransitionRoleError,
  inscriptionTransitionRoleError,
  rbacWorkflowDenialMessage,
} from "@/lib/lonaci/workflow-separation";
import { WORKFLOW_APPROVALS_ENABLED } from "@/lib/lonaci/workflow-approvals";

describe("workflow-separation (approvals désactivées)", () => {
  it("garde le flag désactivé", () => {
    expect(WORKFLOW_APPROVALS_ENABLED).toBe(false);
  });

  it("autorise les rôles opérationnels sur N1 / N2 / finalisation dossier", () => {
    expect(dossierTransitionRoleError("CHEF_SERVICE", "VALIDE_N1")).toBeNull();
    expect(dossierTransitionRoleError("ASSIST_CDS", "VALIDE_N1")).toBeNull();
    expect(dossierTransitionRoleError("CHEF_SECTION", "VALIDE_N2")).toBeNull();
    expect(dossierTransitionRoleError("AGENT", "FINALISE")).toBeNull();
    expect(dossierTransitionRoleError("AUDITEUR", "VALIDE_N1")).toBe("ROLE_FORBIDDEN");
  });

  it("autorise les rôles opérationnels sur inscription N1", () => {
    expect(inscriptionTransitionRoleError("VALIDATE_N1", "CHEF_SERVICE", "SOUMIS")).toBeNull();
    expect(inscriptionTransitionRoleError("REJECT", "AGENT", "SOUMIS")).toBeNull();
    expect(inscriptionTransitionRoleError("VALIDATE_N1", "AUDITEUR", "SOUMIS")).toBe(
      "FORBIDDEN_TRANSITION",
    );
  });

  it("ne produit plus de message RBAC de séparation", () => {
    expect(rbacWorkflowDenialMessage("CHEF_SERVICE", "DOSSIERS", "VALIDATE_N2")).toBeNull();
  });
});
