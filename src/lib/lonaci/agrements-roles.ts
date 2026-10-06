import type { LonaciRole } from "@/lib/lonaci/constants";

/** Seul(e) l'assistant(e) du DGVR importe la liste des agréments ; le Chef de service garde l'accès complet. */
export const AGREMENTS_IMPORT_ROLES = ["ASSIST_DGVR", "CHEF_SERVICE"] as const satisfies readonly LonaciRole[];

export const AGREMENTS_READ_ROLES = [
  "AGENT",
  "CHEF_SECTION",
  "ASSIST_CDS",
  "CHEF_SERVICE",
  "AUDITEUR",
  "ASSIST_DGVR",
] as const satisfies readonly LonaciRole[];

export function canImportAgrements(role: LonaciRole | null | undefined): boolean {
  return role != null && (AGREMENTS_IMPORT_ROLES as readonly LonaciRole[]).includes(role);
}
