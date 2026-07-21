import {
  CESSION_STATUT_METIER_DESCRIPTIONS,
  CESSION_STATUT_METIER_DISPLAY_LABELS,
  type CessionStatutMetier,
} from "@/lib/lonaci/cession-statut-metier-constants";

export {
  CESSION_STATUTS_METIER,
  CESSION_STATUT_METIER_DESCRIPTIONS,
  CESSION_STATUT_METIER_DISPLAY_LABELS,
  CESSION_STATUTS_SPEC_54,
  type CessionStatutMetier,
} from "@/lib/lonaci/cession-statut-metier-constants";

export type CessionWorkflowStatut =
  | "SAISIE_AGENT"
  | "CONTROLE_CHEF_SECTION"
  | "VALIDATION_N2"
  | "VALIDEE_CHEF_SERVICE"
  | "REJETEE";

const VALIDATION_CIRCUIT = new Set<CessionWorkflowStatut>([
  "CONTROLE_CHEF_SECTION",
  "VALIDATION_N2",
]);

/**
 * Résout le statut métier à partir du statut technique, de la liste des pièces et de la génération de l’acte.
 */
export function resolveCessionStatutMetier(input: {
  kind?: "CESSION" | "DELOCALISATION" | "CESSION_DELOCALISATION" | null;
  statut: string;
  checklistComplet?: boolean | null;
  acteGenereAt?: Date | string | null;
}): CessionStatutMetier {
  const statut = input.statut.trim().toUpperCase() as CessionWorkflowStatut;

  if (statut === "VALIDEE_CHEF_SERVICE") {
    return "CESSION_FINALISEE";
  }

  if (input.acteGenereAt) {
    return "ACTE_GENERE";
  }

  if (VALIDATION_CIRCUIT.has(statut)) {
    return "EN_VALIDATION";
  }

  if (statut === "SAISIE_AGENT") {
    const isCession = input.kind === "CESSION";
    if (isCession && input.checklistComplet === true) {
      return "DOSSIER_COMPLET";
    }
    return "EN_CONSTITUTION";
  }

  return "EN_CONSTITUTION";
}

export function cessionStatutMetierLabel(statut: CessionStatutMetier): string {
  return CESSION_STATUT_METIER_DISPLAY_LABELS[statut];
}

export function cessionStatutMetierDescription(statut: CessionStatutMetier): string {
  return CESSION_STATUT_METIER_DESCRIPTIONS[statut];
}

export function cessionStatutMetierBadgeClass(statut: CessionStatutMetier): string {
  switch (statut) {
    case "EN_CONSTITUTION":
      return "border-amber-200 bg-amber-50 text-amber-950";
    case "DOSSIER_COMPLET":
      return "border-cyan-200 bg-cyan-50 text-cyan-950";
    case "EN_VALIDATION":
      return "border-indigo-200 bg-indigo-50 text-indigo-950";
    case "ACTE_GENERE":
      return "border-violet-200 bg-violet-50 text-violet-950";
    case "CESSION_FINALISEE":
      return "border-emerald-200 bg-emerald-50 text-emerald-900";
  }
}

export function cessionStatutMetierFields(input: {
  kind?: "CESSION" | "DELOCALISATION" | "CESSION_DELOCALISATION" | null;
  statut: string;
  checklistComplet?: boolean | null;
  acteGenereAt?: Date | string | null;
}) {
  const statutMetier = resolveCessionStatutMetier(input);
  return {
    statutMetier,
    statutMetierLabel: cessionStatutMetierLabel(statutMetier),
    statutMetierDescription: cessionStatutMetierDescription(statutMetier),
  };
}

/** Libellé affiché pour un dossier rejeté, en dehors du parcours métier principal. */
export const CESSION_REJETEE_DISPLAY_LABEL = "REJETÉE";
export const CESSION_REJETEE_DESCRIPTION = "Dossier rejeté dans le circuit de validation";

export function cessionDisplayStatutFields(input: {
  kind?: "CESSION" | "DELOCALISATION" | "CESSION_DELOCALISATION" | null;
  statut: string;
  checklistComplet?: boolean | null;
  acteGenereAt?: Date | string | null;
}) {
  if (input.statut.trim().toUpperCase() === "REJETEE") {
    return {
      statutMetier: null,
      statutMetierLabel: CESSION_REJETEE_DISPLAY_LABEL,
      statutMetierDescription: CESSION_REJETEE_DESCRIPTION,
    };
  }
  return cessionStatutMetierFields(input);
}
