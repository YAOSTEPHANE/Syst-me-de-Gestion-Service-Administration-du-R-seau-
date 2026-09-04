import { logger } from "@/lib/observability/logger";

/** Journalise un refus de transition (RBAC / séparation d’étapes). */
export function logWorkflowDenied(input: {
  module: string;
  code: string;
  role?: string | null;
  entityId?: string | null;
  action?: string | null;
  target?: string | null;
}) {
  logger.warn("Transition workflow refusée", {
    event: "WORKFLOW_DENIED",
    module: input.module,
    code: input.code,
    role: input.role ?? undefined,
    entityId: input.entityId ?? undefined,
    action: input.action ?? undefined,
    target: input.target ?? undefined,
  });
}

/** Journalise un échec de génération / envoi de PDF métier. */
export function logPdfFailure(input: {
  document: string;
  code: string;
  entityId?: string | null;
  detail?: string | null;
}) {
  logger.error("Échec génération PDF", {
    event: "PDF_FAILURE",
    document: input.document,
    code: input.code,
    entityId: input.entityId ?? undefined,
    detail: input.detail ?? undefined,
  });
}
