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
