/**
 * Mock Vitest : force le mode validations hiérarchiques pour les tests de séparation des rôles.
 * Usage :
 *   vi.mock("@/lib/lonaci/workflow-approvals", mockWorkflowApprovalsHierarchical);
 */
export async function mockWorkflowApprovalsHierarchical(
  importOriginal: () => Promise<typeof import("@/lib/lonaci/workflow-approvals")>,
) {
  const actual = await importOriginal();
  return {
    ...actual,
    WORKFLOW_APPROVALS_ENABLED: true,
    areWorkflowApprovalsEnabled: () => true,
    roleMayAdvanceWorkflow: (
      role: string | null | undefined,
      expectedWhenEnabled: string | readonly string[],
    ) => {
      const expected =
        typeof expectedWhenEnabled === "string" ? [expectedWhenEnabled] : expectedWhenEnabled;
      return Boolean(role && expected.includes(role));
    },
    workflowAdvanceLabel: () => "Valider l’étape",
    workflowApprovalsModeDescription: () =>
      "Validations hiérarchiques actives : N1 (chef de section) → N2 (assistant CDS) → finalisation (chef de service).",
    workflowApprovalsModeLabel: () => "Hiérarchique",
  };
}
