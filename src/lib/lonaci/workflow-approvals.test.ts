import { describe, expect, it } from "vitest";

import {
  WORKFLOW_APPROVALS_ENABLED,
  areWorkflowApprovalsEnabled,
  workflowAdvanceLabel,
  workflowApprovalsModeLabel,
  workflowApprovalsModeDescription,
} from "@/lib/lonaci/workflow-approvals";

describe("workflow-approvals (mode produit par défaut)", () => {
  it("reste en mode simplifié sans variable d’environnement", () => {
    expect(WORKFLOW_APPROVALS_ENABLED).toBe(false);
    expect(areWorkflowApprovalsEnabled()).toBe(false);
    expect(workflowApprovalsModeLabel()).toBe("Simplifié");
    expect(workflowAdvanceLabel()).toBe("Avancer");
    expect(workflowApprovalsModeDescription()).toMatch(/Mode simplifié/);
  });
});
