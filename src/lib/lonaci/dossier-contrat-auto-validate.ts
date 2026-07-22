import "server-only";

import { areWorkflowApprovalsEnabled } from "@/lib/lonaci/workflow-approvals";
import { finalizeDossierContratActualisation } from "@/lib/lonaci/dossier-contrat-finalize";
import { transitionDossier } from "@/lib/lonaci/dossiers";
import type { DossierDocument, UserDocument } from "@/lib/lonaci/types";

export type AutoValidateContratResult = {
  dossier: DossierDocument;
  /** Passé au moins à SOUMIS. */
  submitted: boolean;
  /** Validations N1/N2 enchaînées automatiquement. */
  autoValidated: boolean;
  /** Contrat Prisma créé (FINALISE) si les prérequis métier étaient réunis. */
  finalized: boolean;
};

/**
 * Soumet un dossier contrat puis, si les portes hiérarchiques sont désactivées,
 * enchaîne automatiquement SOUMIS → VALIDE_N1 → VALIDE_N2.
 * Tente ensuite la finalisation (création du contrat) sans bloquer si non prêt.
 */
export async function submitAndAutoValidateContratDossier(input: {
  dossier: DossierDocument;
  actor: UserDocument;
  submitComment: string;
}): Promise<AutoValidateContratResult> {
  let dossier = input.dossier;
  let submitted = false;
  let autoValidated = false;
  let finalized = false;

  if (dossier.type !== "CONTRAT_ACTUALISATION") {
    return { dossier, submitted, autoValidated, finalized };
  }

  const id = dossier._id ?? "";
  if (!id) {
    return { dossier, submitted, autoValidated, finalized };
  }

  if (dossier.status === "BROUILLON" || dossier.status === "REJETE") {
    dossier = await transitionDossier(id, "SOUMIS", input.actor, input.submitComment);
    submitted = true;
  } else if (dossier.status === "SOUMIS" || dossier.status === "VALIDE_N1" || dossier.status === "VALIDE_N2") {
    submitted = true;
  }

  if (!areWorkflowApprovalsEnabled()) {
    if (dossier.status === "SOUMIS") {
      dossier = await transitionDossier(id, "VALIDE_N1", input.actor, "Validation automatique (N1).");
      autoValidated = true;
    }
    if (dossier.status === "VALIDE_N1") {
      dossier = await transitionDossier(id, "VALIDE_N2", input.actor, "Validation automatique (N2).");
      autoValidated = true;
    }

    if (dossier.status === "VALIDE_N2") {
      const result = await finalizeDossierContratActualisation({
        dossierId: id,
        actor: input.actor,
        comment: "Finalisation automatique après validation.",
      });
      if (result.ok) {
        dossier = result.dossier;
        finalized = true;
        autoValidated = true;
      }
    }
  }

  return { dossier, submitted, autoValidated, finalized };
}
