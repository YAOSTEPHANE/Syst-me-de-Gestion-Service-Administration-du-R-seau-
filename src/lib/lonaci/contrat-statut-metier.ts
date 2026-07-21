import {
  CONTRAT_STATUT_METIER_DESCRIPTIONS,
  CONTRAT_STATUT_METIER_DISPLAY_LABELS,
  type ContratStatutMetier,
} from "@/lib/lonaci/contrat-statut-metier-constants";

export {
  CONTRAT_STATUTS_METIER,
  CONTRAT_STATUT_METIER_DESCRIPTIONS,
  CONTRAT_STATUT_METIER_DISPLAY_LABELS,
  CONTRAT_STATUT_METIER_LABELS,
  type ContratStatutMetier,
} from "@/lib/lonaci/contrat-statut-metier-constants";

const DOSSIER_VALIDATION_STATUSES = new Set(["SOUMIS", "VALIDE_N1", "VALIDE_N2"]);

export function isDossierPretPourContrat(input: {
  checklistComplet: boolean | null;
  cautionPaid: boolean;
  hasDocumentChecklist: boolean;
}): boolean {
  if (input.hasDocumentChecklist) {
    return input.checklistComplet === true && input.cautionPaid;
  }
  return input.cautionPaid;
}

/**
 * Résout le statut métier à partir du contrat, du dossier, de la liste des pièces et de la caution.
 */
export function resolveContratStatutMetier(input: {
  contratStatus?: string | null;
  dossierStatus?: string | null;
  checklistComplet?: boolean | null;
  cautionPaid?: boolean;
  hasDocumentChecklist?: boolean;
}): ContratStatutMetier {
  const contratStatus = (input.contratStatus ?? "").trim().toUpperCase();
  if (contratStatus === "RESILIE" || contratStatus === "CEDE") {
    return "RESILIE";
  }
  if (contratStatus === "ACTIF") {
    return "CONCESSIONNAIRE_ACTIF";
  }

  const dossierStatus = (input.dossierStatus ?? "").trim().toUpperCase();
  if (DOSSIER_VALIDATION_STATUSES.has(dossierStatus)) {
    return "CONTRAT_EN_VALIDATION";
  }

  const cautionPaid = Boolean(input.cautionPaid);
  const hasDocumentChecklist = Boolean(input.hasDocumentChecklist);
  if (
    isDossierPretPourContrat({
      checklistComplet: input.checklistComplet ?? null,
      cautionPaid,
      hasDocumentChecklist,
    })
  ) {
    return "DOSSIER_COMPLET";
  }

  return "DOSSIER_INCOMPLET";
}

export function contratStatutMetierLabel(statut: ContratStatutMetier): string {
  return CONTRAT_STATUT_METIER_DISPLAY_LABELS[statut];
}

export function contratStatutMetierDescription(statut: ContratStatutMetier): string {
  return CONTRAT_STATUT_METIER_DESCRIPTIONS[statut];
}

export function contratStatutMetierBadgeClass(statut: ContratStatutMetier): string {
  switch (statut) {
    case "DOSSIER_INCOMPLET":
      return "border-amber-200 bg-amber-50 text-amber-950";
    case "DOSSIER_COMPLET":
      return "border-cyan-200 bg-cyan-50 text-cyan-950";
    case "CONTRAT_EN_VALIDATION":
      return "border-indigo-200 bg-indigo-50 text-indigo-950";
    case "CONCESSIONNAIRE_ACTIF":
      return "border-emerald-200 bg-emerald-50 text-emerald-900";
    case "RESILIE":
      return "border-slate-300 bg-slate-100 text-slate-800";
  }
}

export interface ContratStatutMetierFields {
  statutMetier: ContratStatutMetier;
  statutMetierLabel: string;
  statutMetierDescription: string;
}

export function contratStatutMetierFields(
  statut: ContratStatutMetier,
): ContratStatutMetierFields {
  return {
    statutMetier: statut,
    statutMetierLabel: contratStatutMetierLabel(statut),
    statutMetierDescription: contratStatutMetierDescription(statut),
  };
}
