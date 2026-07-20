/** Statuts du référentiel Clients (module /clients). Fichier dédié pour éviter les soucis de chargement côté client. */
export const CLIENT_CATEGORIES = ["PARTICULIER", "ENTREPRISE"] as const;
export type ClientCategorie = (typeof CLIENT_CATEGORIES)[number];

export const CLIENT_CATEGORIE_LABELS: Record<ClientCategorie, string> = {
  PARTICULIER: "Particulier",
  ENTREPRISE: "Entreprise",
};

export function normalizeClientCategorie(value: string | null | undefined): ClientCategorie {
  const v = (value ?? "").trim().toUpperCase();
  if (v === "ENTREPRISE") return "ENTREPRISE";
  return "PARTICULIER";
}

/** Libellé principal affiché selon la catégorie. */
export function clientDisplayName(client: {
  categorie?: string | null;
  nomComplet?: string | null;
  raisonSociale: string;
}): string {
  const categorie = normalizeClientCategorie(client.categorie);
  if (categorie === "ENTREPRISE") {
    return client.raisonSociale.trim() || client.nomComplet?.trim() || "—";
  }
  return client.nomComplet?.trim() || client.raisonSociale.trim() || "—";
}

export const CLIENT_STATUTS = [
  "EN_ATTENTE_N1",
  "REJETE",
  "DOSSIER_EN_COURS",
  "ACTIF",
  "INACTIF",
] as const;
export type ClientStatut = (typeof CLIENT_STATUTS)[number];

export const CLIENT_STATUT_LABELS: Record<ClientStatut, string> = {
  EN_ATTENTE_N1: "En attente validation N1 (Chef de section)",
  REJETE: "Rejeté (N1)",
  DOSSIER_EN_COURS: "Dossier en cours (avant paiement caution)",
  ACTIF: "Actif",
  INACTIF: "Inactif",
};

/** Clients utilisables pour constituer une caution (après validation N1, avant ou après premier paiement). */
export const CLIENT_STATUTS_ELIGIBLE_CAUTION: ClientStatut[] = ["DOSSIER_EN_COURS", "ACTIF"];

/** Clients éligibles à un contrat (même périmètre que la caution). */
export const CLIENT_STATUTS_ELIGIBLE_CONTRAT: ClientStatut[] = ["DOSSIER_EN_COURS", "ACTIF"];

/** Parcours client terminé (caution payée) — requis avant promotion concessionnaire PDV. */
export const CLIENT_STATUTS_ELIGIBLE_PROMOTION_CONCESSIONNAIRE: ClientStatut[] = ["ACTIF"];

export function isClientStatutEligibleForCaution(statut: string): boolean {
  return (CLIENT_STATUTS_ELIGIBLE_CAUTION as readonly string[]).includes(statut);
}

export function isClientStatutEligibleForContrat(statut: string): boolean {
  return (CLIENT_STATUTS_ELIGIBLE_CONTRAT as readonly string[]).includes(statut);
}

export function isClientStatutEligibleForPromotionConcessionnaire(statut: string): boolean {
  return (CLIENT_STATUTS_ELIGIBLE_PROMOTION_CONCESSIONNAIRE as readonly string[]).includes(statut);
}

/** Préfixe des identifiants clients par zone (ex. CLI-EDITEC-000042). */
export const CLIENT_CODE_PREFIX = "CLI";

const CLIENT_CODE_SUFFIX_PATTERN = /^[A-Z0-9][A-Z0-9_-]{0,31}$/;

/** Préfixe complet attendu pour une agence : `CLI-{AGENCE}-`. */
export function clientCodePrefixForAgence(agenceCode: string): string {
  const ag = agenceCode.trim().toUpperCase();
  return `${CLIENT_CODE_PREFIX}-${ag}-`;
}

export function isValidClientCodeSuffix(suffix: string): boolean {
  const normalized = suffix.trim().toUpperCase();
  return normalized.length >= 1 && normalized.length <= 32 && CLIENT_CODE_SUFFIX_PATTERN.test(normalized);
}

/**
 * Normalise la saisie utilisateur en code complet `CLI-{AGENCE}-{suffix}`.
 * @throws Error `CLIENT_CODE_INVALID` | `CLIENT_CODE_AGENCE_MISMATCH`
 */
export function normalizeClientCodeForAgence(rawCode: string, agenceCode: string): string {
  const trimmed = rawCode.trim().toUpperCase();
  const prefix = clientCodePrefixForAgence(agenceCode);

  if (trimmed.startsWith(`${CLIENT_CODE_PREFIX}-`)) {
    if (!trimmed.startsWith(prefix)) {
      throw new Error("CLIENT_CODE_AGENCE_MISMATCH");
    }
    const suffix = trimmed.slice(prefix.length);
    if (!isValidClientCodeSuffix(suffix)) {
      throw new Error("CLIENT_CODE_INVALID");
    }
    return trimmed;
  }

  if (!isValidClientCodeSuffix(trimmed)) {
    throw new Error("CLIENT_CODE_INVALID");
  }
  return `${prefix}${trimmed}`;
}
