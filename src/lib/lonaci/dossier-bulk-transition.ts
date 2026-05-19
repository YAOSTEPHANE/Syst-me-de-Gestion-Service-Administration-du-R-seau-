import { finalizeDossierContratActualisation } from "@/lib/lonaci/dossier-contrat-finalize";
import { findDossierById, transitionDossier } from "@/lib/lonaci/dossiers";
import type { UserDocument } from "@/lib/lonaci/types";

export type DossierBulkTransitionAction =
  | "SUBMIT"
  | "VALIDATE_N1"
  | "VALIDATE_N2"
  | "FINALIZE"
  | "REJECT"
  | "RETURN_PREVIOUS"
  | "REJECT_TO_DRAFT";

export function toDossierBulkRbacAction(action: DossierBulkTransitionAction) {
  switch (action) {
    case "VALIDATE_N1":
      return "VALIDATE_N1" as const;
    case "VALIDATE_N2":
      return "VALIDATE_N2" as const;
    case "FINALIZE":
      return "FINALIZE" as const;
    case "REJECT":
      return "REJECT" as const;
    case "RETURN_PREVIOUS":
    case "REJECT_TO_DRAFT":
      return "RETURN_FOR_CORRECTION" as const;
    default:
      return "UPDATE" as const;
  }
}

function toTargetStatus(action: DossierBulkTransitionAction) {
  switch (action) {
    case "SUBMIT":
      return "SOUMIS" as const;
    case "VALIDATE_N1":
      return "VALIDE_N1" as const;
    case "VALIDATE_N2":
      return "VALIDE_N2" as const;
    case "FINALIZE":
      return "FINALISE" as const;
    default:
      return "BROUILLON" as const;
  }
}

export function dossierBulkErrorMessage(code: string): string {
  if (code === "ROLE_FORBIDDEN" || code === "AGENCE_FORBIDDEN") return "Accès refusé.";
  if (code === "CONCESSIONNAIRE_BLOQUE") return "Concessionnaire bloqué.";
  if (code === "ACTIVE_CONTRACT_EXISTS") return "Un contrat actif existe déjà.";
  if (code === "INVALID_TRANSITION") return "Transition de statut invalide.";
  if (code === "DOSSIER_NOT_FOUND") return "Dossier introuvable.";
  if (code === "DOSSIER_CHECKLIST_INCOMPLETE") {
    return "Soumission impossible : checklist documents incomplète (tous les documents obligatoires doivent être « Fourni »).";
  }
  return "Transition impossible.";
}

export async function executeDossierBulkTransition(input: {
  ids: string[];
  action: DossierBulkTransitionAction;
  comment?: string | null;
  actor: UserDocument;
}) {
  const results: Array<{ id: string; ok: boolean; message: string }> = [];
  let succeeded = 0;

  for (const id of input.ids) {
    try {
      const before = await findDossierById(id);
      if (!before || before.deletedAt) {
        results.push({ id, ok: false, message: "Dossier introuvable." });
        continue;
      }

      if (input.action === "RETURN_PREVIOUS") {
        const previousTarget =
          before.status === "VALIDE_N2" ? "VALIDE_N1" : before.status === "VALIDE_N1" ? "SOUMIS" : "BROUILLON";
        await transitionDossier(id, previousTarget, input.actor, input.comment ?? null);
        succeeded += 1;
        results.push({ id, ok: true, message: "Transition effectuée." });
        continue;
      }

      const target = toTargetStatus(input.action);
      if (input.action === "FINALIZE" && before.type === "CONTRAT_ACTUALISATION") {
        const finalized = await finalizeDossierContratActualisation({
          dossierId: id,
          actor: input.actor,
          comment: input.comment ?? null,
        });
        if (!finalized.ok) {
          results.push({ id, ok: false, message: finalized.message });
          continue;
        }
        succeeded += 1;
        results.push({ id, ok: true, message: "Finalisation effectuée." });
        continue;
      }

      await transitionDossier(id, target, input.actor, input.comment ?? null);
      succeeded += 1;
      results.push({ id, ok: true, message: "Transition effectuée." });
    } catch (error) {
      const code = error instanceof Error ? error.message : "UNKNOWN";
      results.push({ id, ok: false, message: dossierBulkErrorMessage(code) });
    }
  }

  return {
    total: input.ids.length,
    succeeded,
    failed: input.ids.length - succeeded,
    results,
  };
}
