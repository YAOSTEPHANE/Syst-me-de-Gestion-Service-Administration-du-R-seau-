import type { SuccessionStep } from "@/lib/lonaci/constants";
import {
  SUCCESSION_STATUT_METIER_DESCRIPTIONS,
  SUCCESSION_STATUT_METIER_DISPLAY_LABELS,
  type SuccessionStatutMetier,
} from "@/lib/lonaci/succession-statut-metier-constants";

export {
  SUCCESSION_STATUTS_METIER,
  SUCCESSION_STATUTS_SPEC_103,
  SUCCESSION_STATUT_METIER_DESCRIPTIONS,
  SUCCESSION_STATUT_METIER_DISPLAY_LABELS,
  type SuccessionStatutMetier,
} from "@/lib/lonaci/succession-statut-metier-constants";

export type ResolveSuccessionStatutMetierInput = {
  status: "OUVERT" | "CLOTURE";
  decisionType?: "TRANSFERT" | "RESILIATION" | null;
  checklistComplet?: boolean | null;
  validationN1At?: Date | string | null;
  validationN2At?: Date | string | null;
  stepHistory: Array<{ step: SuccessionStep | string }>;
  currentStepLabel?: SuccessionStep | string | null;
};

function stepCompleted(history: ResolveSuccessionStatutMetierInput["stepHistory"], step: SuccessionStep): boolean {
  return history.some((s) => s.step === step);
}

function isDossierCompletReady(input: ResolveSuccessionStatutMetierInput): boolean {
  return Boolean(
    input.checklistComplet && input.validationN1At && input.validationN2At,
  );
}

/**
 * Résout le statut métier à partir du workflow, de la checklist et de la décision.
 */
export function resolveSuccessionStatutMetier(input: ResolveSuccessionStatutMetierInput): SuccessionStatutMetier {
  const decision = input.decisionType ?? null;
  if (decision === "TRANSFERT") {
    return "TRANSFERT_EFFECTUE";
  }
  if (decision === "RESILIATION") {
    return "RESILIE";
  }

  if (stepCompleted(input.stepHistory, "VERIFICATION_JURIDIQUE")) {
    return "EN_INSTRUCTION";
  }

  if (isDossierCompletReady(input)) {
    return "DOSSIER_COMPLET";
  }

  return "DECLARE";
}

export function successionStatutMetierLabel(statut: SuccessionStatutMetier): string {
  return SUCCESSION_STATUT_METIER_DISPLAY_LABELS[statut];
}

export function successionStatutMetierDescription(statut: SuccessionStatutMetier): string {
  return SUCCESSION_STATUT_METIER_DESCRIPTIONS[statut];
}

export function successionStatutMetierBadgeClass(statut: SuccessionStatutMetier): string {
  switch (statut) {
    case "DECLARE":
      return "border-amber-200 bg-amber-50 text-amber-950";
    case "DOSSIER_COMPLET":
      return "border-cyan-200 bg-cyan-50 text-cyan-950";
    case "EN_INSTRUCTION":
      return "border-indigo-200 bg-indigo-50 text-indigo-950";
    case "TRANSFERT_EFFECTUE":
      return "border-emerald-200 bg-emerald-50 text-emerald-900";
    case "RESILIE":
      return "border-slate-300 bg-slate-100 text-slate-800";
  }
}

export function successionStatutMetierFields(input: ResolveSuccessionStatutMetierInput) {
  const statutMetier = resolveSuccessionStatutMetier(input);
  return {
    statutMetier,
    statutMetierLabel: successionStatutMetierLabel(statutMetier),
    statutMetierDescription: successionStatutMetierDescription(statutMetier),
  };
}
