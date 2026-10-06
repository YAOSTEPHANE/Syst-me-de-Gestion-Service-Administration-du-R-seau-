/** Statuts pipeline phoning (module /soumissions). */

export const SOUMISSION_STATUTS = [
  "A_APPELER",
  "EN_COURS",
  "EN_ATTENTE_PAIEMENT",
  "CONVERTI",
  "SANS_SUITE",
] as const;

export type SoumissionStatut = (typeof SOUMISSION_STATUTS)[number];

export const SOUMISSION_STATUT_LABELS: Record<SoumissionStatut, string> = {
  A_APPELER: "À appeler",
  EN_COURS: "En cours",
  EN_ATTENTE_PAIEMENT: "En attente de paiement",
  CONVERTI: "Converti",
  SANS_SUITE: "Sans suite",
};

export const SOUMISSION_STATUT_DEFAULT: SoumissionStatut = "A_APPELER";

export type SoumissionAppelState = { statut: SoumissionStatut; appele: boolean };

/** Tout statut autre que « À appeler » suppose qu'un appel a eu lieu. */
export function soumissionStatutImpliqueAppel(statut: SoumissionStatut): boolean {
  return statut !== "A_APPELER";
}

/** « Non appelé » n'est possible que tant que la soumission n'a pas dépassé « En cours ». */
export function canMarkSoumissionNonAppele(statut: SoumissionStatut): boolean {
  return statut === "A_APPELER" || statut === "EN_COURS";
}

/**
 * Aligne le marquage « Appelé » et le statut :
 * - un statut autre que « À appeler » coche « Appelé » ;
 * - cocher « Appelé » sur « À appeler » passe en « En cours » ;
 * - décocher « Appelé » sur « En cours » revient à « À appeler ».
 * `current` = état enregistré (null à la création) ; `patch` = valeurs demandées.
 */
export function harmonizeSoumissionAppel(
  current: SoumissionAppelState | null,
  patch: { statut?: SoumissionStatut; appele?: boolean },
): SoumissionAppelState {
  const statut = patch.statut ?? current?.statut ?? SOUMISSION_STATUT_DEFAULT;
  const appele = patch.appele ?? current?.appele ?? false;
  const statutChanged = !current || statut !== current.statut;
  const appeleChanged = !current || appele !== current.appele;

  if (statutChanged && soumissionStatutImpliqueAppel(statut)) return { statut, appele: true };
  if (appeleChanged && appele && statut === "A_APPELER") return { statut: "EN_COURS", appele: true };
  if (appeleChanged && !appele && statut === "EN_COURS") return { statut: "A_APPELER", appele: false };
  return { statut, appele: appele || soumissionStatutImpliqueAppel(statut) };
}

export function normalizeSoumissionStatut(
  value: string | null | undefined,
): SoumissionStatut | null {
  const v = (value ?? "").trim().toUpperCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
  if (!v) return null;

  if (
    v === "A_APPELER" ||
    v === "A APPELER" ||
    v === "AAPPELER" ||
    v === "A RAPPELER" ||
    v === "NOUVEAU" ||
    v === "NOUVEAU CONTACT"
  ) {
    return "A_APPELER";
  }
  if (v === "EN_COURS" || v === "EN COURS" || v === "ENCOURS" || v === "EN APPEL") {
    return "EN_COURS";
  }
  if (
    v === "EN_ATTENTE_PAIEMENT" ||
    v === "EN ATTENTE PAIEMENT" ||
    v === "EN ATTENTE DE PAIEMENT" ||
    v === "ATTENTE PAIEMENT" ||
    v === "PAIEMENT"
  ) {
    return "EN_ATTENTE_PAIEMENT";
  }
  if (v === "CONVERTI" || v === "CONVERTED" || v === "CLIENT" || v === "GAGNE") {
    return "CONVERTI";
  }
  if (
    v === "SANS_SUITE" ||
    v === "SANS SUITE" ||
    v === "SANSSUITE" ||
    v === "ABANDON" ||
    v === "PERDU"
  ) {
    return "SANS_SUITE";
  }

  if ((SOUMISSION_STATUTS as readonly string[]).includes(v)) {
    return v as SoumissionStatut;
  }
  return null;
}
