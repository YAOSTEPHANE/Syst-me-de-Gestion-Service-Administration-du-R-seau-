import type { CautionStatus, LonaciRole } from "@/lib/lonaci/constants";

export type CautionCorrectionReturnLevel = "N1" | "N2" | "FINALISATION";

export function canValidateCautionN1(role: LonaciRole, status: CautionStatus): boolean {
  return role === "CHEF_SECTION" && status === "EN_ATTENTE";
}

export function canValidateCautionN2(role: LonaciRole, status: CautionStatus): boolean {
  return role === "ASSIST_CDS" && status === "VALIDE_N1";
}

export function canFinalizeCaution(role: LonaciRole, status: CautionStatus): boolean {
  return role === "CHEF_SERVICE" && status === "VALIDE_N2";
}

export function resolveCautionCorrectionReturnLevel(
  role: LonaciRole,
  status: CautionStatus,
): CautionCorrectionReturnLevel | null {
  if (role === "CHEF_SECTION" && status === "EN_ATTENTE") return "N1";
  if (role === "ASSIST_CDS" && status === "VALIDE_N1") return "N2";
  if (role === "CHEF_SERVICE" && status === "VALIDE_N2") return "FINALISATION";
  return null;
}
