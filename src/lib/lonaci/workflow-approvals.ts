import type { LonaciRole } from "@/lib/lonaci/constants";

/**
 * Validations hiérarchiques N1 / N2 / finalisation : désactivées dans toute l’application.
 * Tout rôle opérationnel peut avancer chaque étape ; l’historique des statuts reste en base.
 */
export const WORKFLOW_APPROVALS_ENABLED: boolean = false;

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

/** Rôles admis par une route d'étape (N1/N2/finalisation), alignés sur `roleMayAdvanceWorkflow`. */
export function workflowStepRoles(expectedWhenEnabled: LonaciRole): LonaciRole[] {
  return areWorkflowApprovalsEnabled() ? [expectedWhenEnabled] : [...OPS_ROLES];
}

/** Libellé unique de progression (plus de « Valider N1 / N2 » sans validations hiérarchiques). */
export function workflowAdvanceLabel(): string {
  return areWorkflowApprovalsEnabled() ? "Valider l’étape" : "Finaliser";
}

/**
 * Étapes intermédiaires à franchir automatiquement pour atteindre `target` depuis `current`
 * lorsque les validations hiérarchiques sont désactivées (vide sinon).
 */
export function intermediateWorkflowSteps<S extends string>(
  chain: readonly S[],
  current: S,
  target: S,
): S[] {
  if (areWorkflowApprovalsEnabled()) return [];
  const from = chain.indexOf(current);
  const to = chain.indexOf(target);
  if (from < 0 || to < 0 || to - from <= 1) return [];
  return chain.slice(from + 1, to);
}

export type AutoFinalizeOutcome = { finalized: true } | { finalized: false; blockedBy: string };

/**
 * Finalisation automatique après création / soumission : un prérequis manquant laisse le dossier
 * « à finaliser » sans faire échouer l’opération appelante.
 */
export async function autoFinalizeQuietly(run: () => Promise<unknown>): Promise<AutoFinalizeOutcome | null> {
  if (areWorkflowApprovalsEnabled()) return null;
  try {
    await run();
    return { finalized: true };
  } catch (e) {
    return { finalized: false, blockedBy: e instanceof Error ? e.message : "UNKNOWN" };
  }
}

const AUTO_FINALIZE_BLOCKERS: Readonly<Record<string, string>> = {
  CHECKLIST_INCOMPLETE: "checklist des pièces incomplète",
  SUCCESSION_CHECKLIST_INCOMPLETE: "checklist des pièces incomplète",
  CAUTION_FICHE_PROVISOIRE: "paiement de la caution à enregistrer",
  CAUTION_PAYMENT_REFERENCE_REQUISE: "référence de paiement manquante",
  GPS_REQUIRED: "coordonnées GPS manquantes",
  RESILIATION_CONFIRMATION_REQUIRED: "confirmation de la résiliation requise",
  ACTIVE_CONTRAT_REQUIRED: "aucun contrat actif pour ce produit",
  CLIENT_EMAIL_MISSING: "email du client manquant",
  SMTP_SEND_FAILED: "envoi de l’email impossible",
};

/** Suffixe de message après création : « finalisé » ou raison de l’attente de finalisation. */
export function autoFinalizeSuffix(outcome: AutoFinalizeOutcome | null | undefined): string {
  if (!outcome) return ".";
  if (outcome.finalized) return " et finalisé(e).";
  const reason = AUTO_FINALIZE_BLOCKERS[outcome.blockedBy];
  return reason ? ` — à finaliser (${reason}).` : " — à finaliser.";
}

/** Description du mode pour l’UI (Paramètres, bandeaux). */
export function workflowApprovalsModeDescription(): string {
  if (areWorkflowApprovalsEnabled()) {
    return "Validations hiérarchiques actives : N1 (chef de section) → N2 (assistant CDS) → finalisation (chef de service).";
  }
  return "Sans validations N1/N2 : chaque dossier est finalisé dès sa soumission. S’il manque une pièce ou un paiement, il reste « à finaliser » et un seul clic sur « Finaliser » suffit une fois le prérequis réglé.";
}

export function workflowApprovalsModeLabel(): string {
  return areWorkflowApprovalsEnabled() ? "Hiérarchique" : "Simplifié";
}
