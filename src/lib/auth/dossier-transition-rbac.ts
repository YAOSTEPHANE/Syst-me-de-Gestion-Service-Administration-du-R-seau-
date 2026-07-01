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

export type DossierWorkflowEtape =
  | "BROUILLON"
  | "SOUMIS"
  | "VALIDE_N1"
  | "VALIDE_N2"
  | "FINALISE"
  | "REJETE";

const DOSSIER_TRANSITION_ACTIONS: DossierTransitionAction[] = [
  "SUBMIT",
  "VALIDATE_N1",
  "VALIDATE_N2",
  "FINALIZE",
  "REJECT",
  "RETURN_PREVIOUS",
];

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

export function normalizeDossierWorkflowEtape(
  etape: string | null | undefined,
): DossierWorkflowEtape | null {
  const normalized = (etape ?? "").trim().toUpperCase();
  if (
    normalized === "BROUILLON" ||
    normalized === "SOUMIS" ||
    normalized === "VALIDE_N1" ||
    normalized === "VALIDE_N2" ||
    normalized === "FINALISE" ||
    normalized === "REJETE"
  ) {
    return normalized;
  }
  return null;
}

/** Action principale attendue à l'étape métier courante du dossier. */
export function primaryDossierTransitionActionForEtape(
  etape: string | null | undefined,
): DossierTransitionAction | null {
  switch (normalizeDossierWorkflowEtape(etape)) {
    case "BROUILLON":
    case "REJETE":
      return "SUBMIT";
    case "SOUMIS":
      return "VALIDATE_N1";
    case "VALIDE_N1":
      return "VALIDATE_N2";
    case "VALIDE_N2":
      return "FINALIZE";
    default:
      return null;
  }
}

/** L'action n'a de sens qu'à l'étape métier correspondante (ex. N2 seulement si Validé N1). */
export function dossierEtapeAllowsAction(
  etape: string | null | undefined,
  action: DossierTransitionAction,
): boolean {
  const step = normalizeDossierWorkflowEtape(etape);
  if (!step) return false;
  switch (action) {
    case "SUBMIT":
      return step === "BROUILLON" || step === "REJETE";
    case "VALIDATE_N1":
      return step === "SOUMIS";
    case "VALIDATE_N2":
      return step === "VALIDE_N1";
    case "FINALIZE":
      return step === "VALIDE_N2";
    case "REJECT":
    case "RETURN_PREVIOUS":
      return step === "SOUMIS" || step === "VALIDE_N1" || step === "VALIDE_N2";
    default:
      return false;
  }
}

export function hideDossierN1N2ForChefService(
  role: string | null,
  action: DossierTransitionAction,
): boolean {
  return role === "CHEF_SERVICE" && (action === "VALIDATE_N1" || action === "VALIDATE_N2");
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

/** Rôle autorisé ET étape métier atteinte pour cette action. */
export function userCanPerformDossierTransitionAtEtape(
  role: string | null,
  etape: string | null | undefined,
  action: DossierTransitionAction,
): boolean {
  if (!dossierEtapeAllowsAction(etape, action)) return false;
  if (hideDossierN1N2ForChefService(role, action)) return false;
  return userMayPerformDossierTransition(role, action);
}

export function listDossierTransitionActionsForUi(
  role: string | null,
  etape: string | null | undefined,
): DossierTransitionAction[] {
  return DOSSIER_TRANSITION_ACTIONS.filter((action) =>
    userCanPerformDossierTransitionAtEtape(role, etape, action),
  );
}

/** Actions proposées en lot (filtrées par statut liste si défini). */
export function listDossierBulkActionsForUi(
  role: string | null,
  statusFilter?: string | null,
): DossierTransitionAction[] {
  return DOSSIER_TRANSITION_ACTIONS.filter((action) => {
    if (hideDossierN1N2ForChefService(role, action)) return false;
    if (!userMayPerformDossierTransition(role, action)) return false;
    if (statusFilter) {
      return dossierEtapeAllowsAction(statusFilter, action);
    }
    return true;
  });
}

export function userCanApproveDossierAtEtape(
  role: string | null,
  etape: string | null | undefined,
): boolean {
  const primary = primaryDossierTransitionActionForEtape(etape);
  if (!primary) return false;
  return userCanPerformDossierTransitionAtEtape(role, etape, primary);
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
