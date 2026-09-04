import type { LonaciRole } from "@/lib/lonaci/constants";

/**
 * Validations hiérarchiques N1 / N2 / finalisation.
 *
 * - `LONACI_WORKFLOW_APPROVALS_ENABLED=true` → séparation stricte des rôles.
 * - absent / `false` → mode simplifié (défaut actuel) : tout rôle opérationnel
 *   peut avancer une étape ; l’historique des statuts reste en base.
 */
function readWorkflowApprovalsEnabled(): boolean {
  const raw = process.env.LONACI_WORKFLOW_APPROVALS_ENABLED?.trim().toLowerCase();
  if (raw === "true" || raw === "1" || raw === "yes") return true;
  return false;
}

export const WORKFLOW_APPROVALS_ENABLED = readWorkflowApprovalsEnabled();

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

/** Libellé unique de progression (plus de « Valider N1 / N2 / Finaliser » en mode simplifié). */
export function workflowAdvanceLabel(): string {
  return areWorkflowApprovalsEnabled() ? "Valider l’étape" : "Avancer";
}

/** Description du mode pour l’UI (Paramètres, bandeaux). */
export function workflowApprovalsModeDescription(): string {
  if (areWorkflowApprovalsEnabled()) {
    return "Validations hiérarchiques actives : N1 (chef de section) → N2 (assistant CDS) → finalisation (chef de service).";
  }
  return "Mode simplifié : tout rôle opérationnel peut avancer une étape. Les statuts N1/N2 restent en historique.";
}

export function workflowApprovalsModeLabel(): string {
  return areWorkflowApprovalsEnabled() ? "Hiérarchique" : "Simplifié";
}
