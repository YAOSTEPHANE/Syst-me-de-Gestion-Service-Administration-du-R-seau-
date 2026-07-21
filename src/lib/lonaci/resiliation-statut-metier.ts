import {
  RESILIATION_STATUT_METIER_DESCRIPTIONS,
  RESILIATION_STATUT_METIER_DISPLAY_LABELS,
  type ResiliationStatutMetier,
} from "@/lib/lonaci/resiliation-statut-metier-constants";

export {
  RESILIATION_STATUTS_METIER,
  RESILIATION_STATUT_METIER_DESCRIPTIONS,
  RESILIATION_STATUT_METIER_DISPLAY_LABELS,
  RESILIATION_STATUTS_SPEC_72,
  type ResiliationStatutMetier,
} from "@/lib/lonaci/resiliation-statut-metier-constants";

export type ResiliationWorkflowStatut =
  | "DOSSIER_RECU"
  | "CONTROLE_CHEF_SECTION"
  | "VALIDATION_N2"
  | "RESILIE"
  | "REJETEE";

const VALIDATION_CIRCUIT = new Set<ResiliationWorkflowStatut>([
  "CONTROLE_CHEF_SECTION",
  "VALIDATION_N2",
]);

/**
 * Résout le statut métier à partir du statut technique et de la liste des pièces.
 */
export function resolveResiliationStatutMetier(input: {
  statut: string;
  checklistComplet?: boolean | null;
}): ResiliationStatutMetier {
  const statut = input.statut.trim().toUpperCase() as ResiliationWorkflowStatut;

  if (statut === "RESILIE") {
    return "RESILIEE";
  }

  if (VALIDATION_CIRCUIT.has(statut)) {
    return "EN_VALIDATION";
  }

  if (statut === "DOSSIER_RECU") {
    if (input.checklistComplet === true) {
      return "DOSSIER_COMPLET";
    }
    return "EN_CONSTITUTION";
  }

  return "EN_CONSTITUTION";
}

export function resiliationStatutMetierLabel(statut: ResiliationStatutMetier): string {
  return RESILIATION_STATUT_METIER_DISPLAY_LABELS[statut];
}

export function resiliationStatutMetierDescription(statut: ResiliationStatutMetier): string {
  return RESILIATION_STATUT_METIER_DESCRIPTIONS[statut];
}

export function resiliationStatutMetierBadgeClass(statut: ResiliationStatutMetier): string {
  switch (statut) {
    case "EN_CONSTITUTION":
      return "border-amber-200 bg-amber-50 text-amber-950";
    case "DOSSIER_COMPLET":
      return "border-cyan-200 bg-cyan-50 text-cyan-950";
    case "EN_VALIDATION":
      return "border-indigo-200 bg-indigo-50 text-indigo-950";
    case "RESILIEE":
      return "border-emerald-200 bg-emerald-50 text-emerald-900";
  }
}

export function resiliationStatutMetierFields(input: {
  statut: string;
  checklistComplet?: boolean | null;
}) {
  const statutMetier = resolveResiliationStatutMetier(input);
  return {
    statutMetier,
    statutMetierLabel: resiliationStatutMetierLabel(statutMetier),
    statutMetierDescription: resiliationStatutMetierDescription(statutMetier),
  };
}

export const RESILIATION_REJETEE_DISPLAY_LABEL = "REJETÉE";
export const RESILIATION_REJETEE_DESCRIPTION = "Dossier rejeté dans le circuit de validation";

export function resiliationDisplayStatutFields(input: {
  statut: string;
  checklistComplet?: boolean | null;
}) {
  if (input.statut.trim().toUpperCase() === "REJETEE") {
    return {
      statutMetier: null,
      statutMetierLabel: RESILIATION_REJETEE_DISPLAY_LABEL,
      statutMetierDescription: RESILIATION_REJETEE_DESCRIPTION,
    };
  }
  return resiliationStatutMetierFields(input);
}
