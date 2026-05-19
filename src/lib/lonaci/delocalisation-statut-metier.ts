import {
  DELOCALISATION_STATUT_METIER_DESCRIPTIONS,
  DELOCALISATION_STATUT_METIER_DISPLAY_LABELS,
  type DelocalisationStatutMetier,
} from "@/lib/lonaci/delocalisation-statut-metier-constants";

export {
  DELOCALISATION_STATUTS_METIER,
  DELOCALISATION_STATUT_METIER_DESCRIPTIONS,
  DELOCALISATION_STATUT_METIER_DISPLAY_LABELS,
  DELOCALISATION_STATUTS_SPEC_63,
  type DelocalisationStatutMetier,
} from "@/lib/lonaci/delocalisation-statut-metier-constants";

export type DelocalisationWorkflowStatut =
  | "SAISIE_AGENT"
  | "CONTROLE_CHEF_SECTION"
  | "VALIDEE_CHEF_SERVICE"
  | "REJETEE";

const VALIDATION_CIRCUIT = new Set<DelocalisationWorkflowStatut>(["CONTROLE_CHEF_SECTION"]);

/**
 * Résout le statut métier 6.3 à partir du statut technique et de la checklist.
 */
export function resolveDelocalisationStatutMetier(input: {
  statut: string;
  checklistComplet?: boolean | null;
}): DelocalisationStatutMetier {
  const statut = input.statut.trim().toUpperCase() as DelocalisationWorkflowStatut;

  if (statut === "VALIDEE_CHEF_SERVICE") {
    return "DELOCALISATION_EFFECTIVE";
  }

  if (VALIDATION_CIRCUIT.has(statut)) {
    return "EN_VALIDATION";
  }

  if (statut === "SAISIE_AGENT") {
    if (input.checklistComplet === true) {
      return "DOSSIER_COMPLET";
    }
    return "EN_CONSTITUTION";
  }

  return "EN_CONSTITUTION";
}

export function delocalisationStatutMetierLabel(statut: DelocalisationStatutMetier): string {
  return DELOCALISATION_STATUT_METIER_DISPLAY_LABELS[statut];
}

export function delocalisationStatutMetierDescription(statut: DelocalisationStatutMetier): string {
  return DELOCALISATION_STATUT_METIER_DESCRIPTIONS[statut];
}

export function delocalisationStatutMetierBadgeClass(statut: DelocalisationStatutMetier): string {
  switch (statut) {
    case "EN_CONSTITUTION":
      return "border-amber-200 bg-amber-50 text-amber-950";
    case "DOSSIER_COMPLET":
      return "border-cyan-200 bg-cyan-50 text-cyan-950";
    case "EN_VALIDATION":
      return "border-indigo-200 bg-indigo-50 text-indigo-950";
    case "DELOCALISATION_EFFECTIVE":
      return "border-emerald-200 bg-emerald-50 text-emerald-900";
  }
}

export function delocalisationStatutMetierFields(input: {
  statut: string;
  checklistComplet?: boolean | null;
}) {
  const statutMetier = resolveDelocalisationStatutMetier(input);
  return {
    statutMetier,
    statutMetierLabel: delocalisationStatutMetierLabel(statutMetier),
    statutMetierDescription: delocalisationStatutMetierDescription(statutMetier),
  };
}

export const DELOCALISATION_REJETEE_DISPLAY_LABEL = "REJETÉE";
export const DELOCALISATION_REJETEE_DESCRIPTION = "Dossier rejeté dans le circuit de validation";

export function delocalisationDisplayStatutFields(input: {
  statut: string;
  checklistComplet?: boolean | null;
}) {
  if (input.statut.trim().toUpperCase() === "REJETEE") {
    return {
      statutMetier: null,
      statutMetierLabel: DELOCALISATION_REJETEE_DISPLAY_LABEL,
      statutMetierDescription: DELOCALISATION_REJETEE_DESCRIPTION,
    };
  }
  return delocalisationStatutMetierFields(input);
}
