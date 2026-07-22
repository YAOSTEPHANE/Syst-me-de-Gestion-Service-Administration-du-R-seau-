import type { LonaciRole } from "@/lib/lonaci/constants";

/**
 * Désactive les validations hiérarchiques N1 / N2 / finalisation.
 * Les étapes restent en base pour l’historique, mais aucun rôle spécifique
 * n’est plus exigé et l’UI n’expose plus ces validations dédiées.
 */
export const WORKFLOW_APPROVALS_ENABLED = false;

export function areWorkflowApprovalsEnabled(): boolean {
  return WORKFLOW_APPROVALS_ENABLED;
}

const OPS_ROLES: readonly LonaciRole[] = [
  "AGENT",
  "CHEF_SECTION",
  "ASSIST_CDS",
  "CHEF_SERVICE",
];

export function isOperationalWorkflowRole(role: string | null | undefined): boolean {
  return Boolean(role && (OPS_ROLES as readonly string[]).includes(role));
}

/** Autorise un rôle pour une étape autrefois réservée (N1/N2/finalisation). */
export function roleMayAdvanceWorkflow(
  role: string | null | undefined,
  expectedWhenEnabled: string | readonly string[],
): boolean {
  if (!areWorkflowApprovalsEnabled()) return isOperationalWorkflowRole(role);
  const expected = typeof expectedWhenEnabled === "string" ? [expectedWhenEnabled] : expectedWhenEnabled;
  return Boolean(role && expected.includes(role));
}

/** Libellé unique de progression (plus de « Valider N1 / N2 / Finaliser »). */
export function workflowAdvanceLabel(): string {
  return "Avancer";
}
