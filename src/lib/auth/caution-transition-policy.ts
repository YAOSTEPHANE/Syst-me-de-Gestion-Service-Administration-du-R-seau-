import type { CautionStatus, LonaciRole } from "@/lib/lonaci/constants";
import {
  areWorkflowApprovalsEnabled,
  isOperationalWorkflowRole,
} from "@/lib/lonaci/workflow-approvals";

export type CautionCorrectionReturnLevel = "N1" | "N2" | "FINALISATION";

export function canValidateCautionN1(role: LonaciRole, status: CautionStatus): boolean {
  if (status !== "EN_ATTENTE") return false;
  if (!areWorkflowApprovalsEnabled()) return isOperationalWorkflowRole(role);
  return role === "CHEF_SECTION";
}

export function canValidateCautionN2(role: LonaciRole, status: CautionStatus): boolean {
  if (status !== "VALIDE_N1") return false;
  if (!areWorkflowApprovalsEnabled()) return isOperationalWorkflowRole(role);
  return role === "ASSIST_CDS";
}

export function canFinalizeCaution(role: LonaciRole, status: CautionStatus): boolean {
  if (status !== "VALIDE_N2") return false;
  if (!areWorkflowApprovalsEnabled()) return isOperationalWorkflowRole(role);
  return role === "CHEF_SERVICE";
}

export function resolveCautionCorrectionReturnLevel(
  role: LonaciRole,
  status: CautionStatus,
): CautionCorrectionReturnLevel | null {
  if (!areWorkflowApprovalsEnabled()) {
    if (!isOperationalWorkflowRole(role)) return null;
    if (status === "EN_ATTENTE") return "N1";
    if (status === "VALIDE_N1") return "N2";
    if (status === "VALIDE_N2") return "FINALISATION";
    return null;
  }
  if (role === "CHEF_SECTION" && status === "EN_ATTENTE") return "N1";
  if (role === "ASSIST_CDS" && status === "VALIDE_N1") return "N2";
  if (role === "CHEF_SERVICE" && status === "VALIDE_N2") return "FINALISATION";
  return null;
}
