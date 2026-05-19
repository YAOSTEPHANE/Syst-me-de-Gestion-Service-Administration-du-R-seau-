import {
  BANCARISATION_STATUT_DESCRIPTIONS,
  BANCARISATION_STATUT_LABELS,
  BANCARISATION_STATUTS,
  BANCARISATION_STATUTS_SPEC_83,
  type BancarisationStatut,
} from "@/lib/lonaci/constants";

export {
  BANCARISATION_STATUTS,
  BANCARISATION_STATUT_LABELS,
  BANCARISATION_STATUT_DESCRIPTIONS,
  BANCARISATION_STATUTS_SPEC_83,
  type BancarisationStatut,
} from "@/lib/lonaci/constants";

const LEGACY_EN_COURS = "EN_COURS";

/**
 * Normalise le statut 8.3 à partir du stockage (y compris legacy EN_COURS + etatRib).
 */
export function normalizeBancarisationStatut(
  statutRaw: string | null | undefined,
  etatRibRaw?: string | null,
): BancarisationStatut {
  const statut = (statutRaw ?? "").trim().toUpperCase();
  const etatRib = (etatRibRaw ?? "").trim().toUpperCase();

  if (statut === "BANCARISE") {
    return "BANCARISE";
  }

  if (
    etatRib === "EN_ATTENTE_RIB" ||
    etatRib === "RIB_FOURNI" ||
    etatRib === "RIB_VALIDE"
  ) {
    return etatRib as BancarisationStatut;
  }

  if ((BANCARISATION_STATUTS as readonly string[]).includes(statut)) {
    return statut as BancarisationStatut;
  }

  if (statut === LEGACY_EN_COURS) {
    return "EN_ATTENTE_RIB";
  }

  return "NON_BANCARISE";
}

export function bancarisationStatutLabel(statut: BancarisationStatut): string {
  return BANCARISATION_STATUT_LABELS[statut];
}

export function bancarisationStatutDescription(statut: BancarisationStatut): string {
  return BANCARISATION_STATUT_DESCRIPTIONS[statut];
}

export function bancarisationStatutBadgeClass(statut: BancarisationStatut): string {
  switch (statut) {
    case "NON_BANCARISE":
      return "border-slate-300 bg-slate-100 text-slate-800";
    case "EN_ATTENTE_RIB":
      return "border-amber-200 bg-amber-50 text-amber-950";
    case "RIB_FOURNI":
      return "border-sky-200 bg-sky-50 text-sky-950";
    case "RIB_VALIDE":
      return "border-indigo-200 bg-indigo-50 text-indigo-950";
    case "BANCARISE":
      return "border-emerald-200 bg-emerald-50 text-emerald-900";
  }
}

export function bancarisationStatutFields(statutRaw: string | null | undefined, etatRibRaw?: string | null) {
  const statut = normalizeBancarisationStatut(statutRaw, etatRibRaw);
  return {
    statutBancarisation: statut,
    statutBancarisationLabel: bancarisationStatutLabel(statut),
    statutBancarisationDescription: bancarisationStatutDescription(statut),
  };
}

export function emptyBancarisationStatutCounts(): Record<BancarisationStatut, number> {
  return {
    NON_BANCARISE: 0,
    EN_ATTENTE_RIB: 0,
    RIB_FOURNI: 0,
    RIB_VALIDE: 0,
    BANCARISE: 0,
  };
}

export function incrementBancarisationStatutCount(
  counts: Record<BancarisationStatut, number>,
  statutRaw: string | null | undefined,
  etatRibRaw?: string | null,
) {
  const s = normalizeBancarisationStatut(statutRaw, etatRibRaw);
  counts[s] += 1;
}
