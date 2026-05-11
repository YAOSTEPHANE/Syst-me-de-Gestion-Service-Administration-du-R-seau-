import { canRole, type RbacAction } from "@/lib/auth/rbac";
import type { LonaciRole } from "@/lib/lonaci/constants";

/** Actions `/api/dossiers/[id]/transition` alignées sur la matrice `DOSSIERS` dans `rbac.ts`. */
export type DossierTransitionAction =
  | "SUBMIT"
  | "VALIDATE_N1"
  | "VALIDATE_N2"
  | "FINALIZE"
  | "REJECT"
  | "RETURN_PREVIOUS";

function dossierTransitionToRbac(action: DossierTransitionAction): RbacAction {
  switch (action) {
    case "SUBMIT":
      return "UPDATE";
    case "RETURN_PREVIOUS":
      return "RETURN_FOR_CORRECTION";
    default:
      return action as RbacAction;
  }
}

export function userMayPerformDossierTransition(
  role: string | null,
  action: DossierTransitionAction,
): boolean {
  if (!role) return false;
  return canRole({
    role: role as LonaciRole,
    resource: "DOSSIERS",
    action: dossierTransitionToRbac(action),
  }).allowed;
}

/** Mise à jour du payload dossier (PATCH /api/dossiers/[id]). */
export function userMayPatchDossierPayload(role: string | null): boolean {
  if (!role) return false;
  return canRole({
    role: role as LonaciRole,
    resource: "DOSSIERS",
    action: "UPDATE",
  }).allowed;
}
