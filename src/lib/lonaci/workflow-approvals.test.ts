import { describe, expect, it } from "vitest";

import {
  WORKFLOW_APPROVALS_ENABLED,
  areWorkflowApprovalsEnabled,
  roleMayAdvanceWorkflow,
  workflowAdvanceLabel,
  workflowStepRoles,
  workflowApprovalsModeLabel,
  workflowApprovalsModeDescription,
} from "@/lib/lonaci/workflow-approvals";

describe("workflow-approvals (mode produit par défaut)", () => {
  it("reste en mode simplifié (validations désactivées)", () => {
    expect(WORKFLOW_APPROVALS_ENABLED).toBe(false);
    expect(areWorkflowApprovalsEnabled()).toBe(false);
    expect(workflowApprovalsModeLabel()).toBe("Simplifié");
    expect(workflowAdvanceLabel()).toBe("Finaliser");
    expect(workflowApprovalsModeDescription()).toMatch(/Sans validations N1\/N2/);
  });

  it("ouvre les routes d'étape à tous les rôles opérationnels, comme les boutons de l'écran", () => {
    for (const expected of ["CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"] as const) {
      const roles = workflowStepRoles(expected);
      expect(roles).toEqual(["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"]);
      for (const role of roles) {
        expect(roleMayAdvanceWorkflow(role, expected)).toBe(true);
      }
    }
  });
});
