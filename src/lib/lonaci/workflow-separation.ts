import type { LonaciRole, ConcessionnaireInscriptionStatut } from "@/lib/lonaci/constants";
import type { RbacAction, RbacResource } from "@/lib/auth/rbac";
import { areWorkflowApprovalsEnabled, isOperationalWorkflowRole } from "@/lib/lonaci/workflow-approvals";
import type { DossierStatus } from "@/lib/lonaci/types";

type InscriptionN1GateAction = "VALIDATE_N1" | "REJECT";

/** Codes d'erreur explicites — séparation N1 / N2 / finalisation. */
export const WORKFLOW_SEPARATION_ERRORS = {
  DOSSIER_N1_CHEF_SECTION_ONLY: "DOSSIER_N1_CHEF_SECTION_ONLY",
  DOSSIER_N2_ASSIST_CDS_ONLY: "DOSSIER_N2_ASSIST_CDS_ONLY",
  DOSSIER_FINALIZE_CHEF_SERVICE_ONLY: "DOSSIER_FINALIZE_CHEF_SERVICE_ONLY",
  INSCRIPTION_N1_CHEF_SECTION_ONLY: "INSCRIPTION_N1_CHEF_SECTION_ONLY",
  INSCRIPTION_REJECT_N1_CHEF_SECTION_ONLY: "INSCRIPTION_REJECT_N1_CHEF_SECTION_ONLY",
} as const;

export type WorkflowSeparationErrorCode =
  (typeof WORKFLOW_SEPARATION_ERRORS)[keyof typeof WORKFLOW_SEPARATION_ERRORS];

export const WORKFLOW_SEPARATION_MESSAGES: Record<WorkflowSeparationErrorCode, string> = {
  DOSSIER_N1_CHEF_SECTION_ONLY:
    "Validation N1 du dossier contrat réservée au chef de section. Le chef de service ne peut pas effectuer cette étape.",
  DOSSIER_N2_ASSIST_CDS_ONLY:
    "Validation N2 du dossier contrat réservée à l'assistant(e) chef(fe) de service. Le chef de service finalise uniquement après la validation N2.",
  DOSSIER_FINALIZE_CHEF_SERVICE_ONLY:
    "Finalisation du dossier contrat réservée au chef de service (après validation N2).",
  INSCRIPTION_N1_CHEF_SECTION_ONLY:
    "Validation N1 d'inscription PDV réservée au chef de section. Le chef de service ne peut pas attribuer le code PDV à cette étape.",
  INSCRIPTION_REJECT_N1_CHEF_SECTION_ONLY:
    "Rejet d'inscription en attente N1 réservé au chef de section.",
};

export function workflowSeparationMessage(code: string): string | null {
  if (code in WORKFLOW_SEPARATION_MESSAGES) {
    return WORKFLOW_SEPARATION_MESSAGES[code as WorkflowSeparationErrorCode];
  }
  return null;
}

export function isWorkflowSeparationError(code: string): boolean {
  return code in WORKFLOW_SEPARATION_MESSAGES || code === "ROLE_FORBIDDEN";
}

export function dossierTransitionRoleError(
  role: LonaciRole,
  targetStatus: DossierStatus,
): WorkflowSeparationErrorCode | "ROLE_FORBIDDEN" | null {
  if (!areWorkflowApprovalsEnabled()) {
    return isOperationalWorkflowRole(role) ? null : "ROLE_FORBIDDEN";
  }
  switch (targetStatus) {
    case "VALIDE_N1":
      if (role !== "CHEF_SECTION") return WORKFLOW_SEPARATION_ERRORS.DOSSIER_N1_CHEF_SECTION_ONLY;
      break;
    case "VALIDE_N2":
      if (role !== "ASSIST_CDS") return WORKFLOW_SEPARATION_ERRORS.DOSSIER_N2_ASSIST_CDS_ONLY;
      break;
    case "FINALISE":
      if (role !== "CHEF_SERVICE") return WORKFLOW_SEPARATION_ERRORS.DOSSIER_FINALIZE_CHEF_SERVICE_ONLY;
      break;
    default:
      break;
  }
  return "ROLE_FORBIDDEN";
}

export function inscriptionTransitionRoleError(
  action: InscriptionN1GateAction,
  role: LonaciRole,
  current: ConcessionnaireInscriptionStatut,
): WorkflowSeparationErrorCode | "FORBIDDEN_TRANSITION" | null {
  if (current !== "SOUMIS") return "FORBIDDEN_TRANSITION";
  if (!areWorkflowApprovalsEnabled()) {
    return isOperationalWorkflowRole(role) ? null : "FORBIDDEN_TRANSITION";
  }
  if (action === "VALIDATE_N1" && role !== "CHEF_SECTION") {
    return WORKFLOW_SEPARATION_ERRORS.INSCRIPTION_N1_CHEF_SECTION_ONLY;
  }
  if (action === "REJECT" && role !== "CHEF_SECTION") {
    return WORKFLOW_SEPARATION_ERRORS.INSCRIPTION_REJECT_N1_CHEF_SECTION_ONLY;
  }
  return "FORBIDDEN_TRANSITION";
}

/** Message RBAC lorsque l'API bloque avant la couche métier. */
export function rbacWorkflowDenialMessage(
  role: LonaciRole,
  resource: RbacResource,
  action: RbacAction,
): string | null {
  if (!areWorkflowApprovalsEnabled()) return null;
  if (resource !== "DOSSIERS") return null;

  if (action === "VALIDATE_N1") {
    if (role === "CHEF_SERVICE") return WORKFLOW_SEPARATION_MESSAGES.DOSSIER_N1_CHEF_SECTION_ONLY;
    if (role === "ASSIST_CDS") {
      return "Validation N1 du dossier contrat réservée au chef de section.";
    }
  }
  if (action === "VALIDATE_N2") {
    if (role === "CHEF_SERVICE") return WORKFLOW_SEPARATION_MESSAGES.DOSSIER_N2_ASSIST_CDS_ONLY;
    if (role === "CHEF_SECTION") {
      return WORKFLOW_SEPARATION_MESSAGES.DOSSIER_N2_ASSIST_CDS_ONLY;
    }
  }
  if (action === "FINALIZE") {
    if (role === "CHEF_SECTION" || role === "ASSIST_CDS" || role === "AGENT") {
      return WORKFLOW_SEPARATION_MESSAGES.DOSSIER_FINALIZE_CHEF_SERVICE_ONLY;
    }
  }
  return null;
}
