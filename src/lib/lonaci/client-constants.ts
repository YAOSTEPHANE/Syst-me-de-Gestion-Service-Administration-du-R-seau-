/** Statuts du référentiel Clients (module /clients). Fichier dédié pour éviter les soucis de chargement côté client. */
export const CLIENT_CATEGORIES = ["PARTICULIER", "ENTREPRISE", "CANAL_ALTERNATIF"] as const;
export type ClientCategorie = (typeof CLIENT_CATEGORIES)[number];

export const CLIENT_CATEGORIE_LABELS: Record<ClientCategorie, string> = {
  PARTICULIER: "Particulier",
  ENTREPRISE: "Entreprise",
  CANAL_ALTERNATIF: "Canal alternatif",
};

export function normalizeClientCategorie(value: string | null | undefined): ClientCategorie {
  return parseClientCategorie(value) ?? "PARTICULIER";
}

/** Parse strict : null si la valeur n’est pas une catégorie connue. */
export function parseClientCategorie(value: string | null | undefined): ClientCategorie | null {
  const v = (value ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[\s/-]+/g, "_");
  if (!v) return null;
  if (v === "ENTREPRISE") return "ENTREPRISE";
  if (
    v === "CANAL_ALTERNATIF" ||
    v === "CANALALTERNATIF" ||
    v === "CANAL_ALT" ||
    v === "ALTERNATIF"
  ) {
    return "CANAL_ALTERNATIF";
  }
  if (v === "PARTICULIER") return "PARTICULIER";
  return null;
}

/** Entreprise et canal alternatif : formulaire / validation en raison sociale. */
export function isClientCategorieEntreprise(categorie: ClientCategorie): boolean {
  return categorie === "ENTREPRISE" || categorie === "CANAL_ALTERNATIF";
}

/** Catégories de la liste « Entreprises & canaux alternatifs ». */
export const CLIENT_CATEGORIES_FORME_ENTREPRISE = ["ENTREPRISE", "CANAL_ALTERNATIF"] as const satisfies readonly ClientCategorie[];

/** Catégories de la liste « Particuliers ». */
export const CLIENT_CATEGORIES_FORME_PARTICULIER = ["PARTICULIER"] as const satisfies readonly ClientCategorie[];

/** Libellé principal affiché selon la catégorie. */
export function clientDisplayName(client: {
  categorie?: string | null;
  nomComplet?: string | null;
  raisonSociale: string;
}): string {
  const categorie = normalizeClientCategorie(client.categorie);
  if (isClientCategorieEntreprise(categorie)) {
    return client.raisonSociale.trim() || client.nomComplet?.trim() || "—";
  }
  return client.nomComplet?.trim() || client.raisonSociale.trim() || "—";
}

/** Type de distributeur rattaché au client. */
export const CLIENT_TYPE_DISTRIBUTEUR = ["NOUVEAU", "ANCIEN"] as const;
export type ClientTypeDistributeur = (typeof CLIENT_TYPE_DISTRIBUTEUR)[number];

export const CLIENT_TYPE_DISTRIBUTEUR_LABELS: Record<ClientTypeDistributeur, string> = {
  NOUVEAU: "Nouveau",
  ANCIEN: "Ancien",
};

export function normalizeClientTypeDistributeur(
  value: string | null | undefined,
): ClientTypeDistributeur | null {
  const v = (value ?? "").trim().toUpperCase();
  if (
    v === "NOUVEAU" ||
    v === "NOUVEAU DISTRIBUTEUR" ||
    v === "NOUVEAU CONCESSION" ||
    v === "NEW"
  ) {
    return "NOUVEAU";
  }
  if (v === "ANCIEN" || v === "ANCIENNE" || v === "OLD") return "ANCIEN";
  return null;
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
  EN_ATTENTE_N1: "Dossier en cours",
  REJETE: "Rejeté",
  DOSSIER_EN_COURS: "Dossier en cours",
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
  if ((CLIENT_STATUTS_ELIGIBLE_CAUTION as readonly string[]).includes(statut)) return true;
  // Historique : fiches encore en attente N1 restent utilisables sans validation.
  return statut === "EN_ATTENTE_N1";
}

export function isClientStatutEligibleForContrat(statut: string): boolean {
  if ((CLIENT_STATUTS_ELIGIBLE_CONTRAT as readonly string[]).includes(statut)) return true;
  return statut === "EN_ATTENTE_N1";
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

/**
 * Comme `normalizeClientCodeForAgence`, mais réécrit le préfixe d’agence
 * (`CLI-AUTRE-0001` → `CLI-CIBLE-0001`) pour un import scoppé forcé.
 * @throws Error `CLIENT_CODE_INVALID`
 */
export function remapClientCodeToAgence(rawCode: string, agenceCode: string): string {
  const trimmed = rawCode.trim().toUpperCase();
  const prefix = clientCodePrefixForAgence(agenceCode);

  if (trimmed.startsWith(`${CLIENT_CODE_PREFIX}-`)) {
    const withoutCli = trimmed.slice(`${CLIENT_CODE_PREFIX}-`.length);
    const dash = withoutCli.indexOf("-");
    if (dash <= 0) {
      throw new Error("CLIENT_CODE_INVALID");
    }
    const suffix = withoutCli.slice(dash + 1);
    if (!isValidClientCodeSuffix(suffix)) {
      throw new Error("CLIENT_CODE_INVALID");
    }
    return `${prefix}${suffix}`;
  }

  return normalizeClientCodeForAgence(trimmed, agenceCode);
}

/** Suffixe après `CLI-{AGENCE}-` (ex. `000042`), ou null si format inattendu. */
export function clientCodeSuffix(fullOrRawCode: string): string | null {
  const trimmed = fullOrRawCode.trim().toUpperCase();
  if (!trimmed.startsWith(`${CLIENT_CODE_PREFIX}-`)) {
    return isValidClientCodeSuffix(trimmed) ? trimmed : null;
  }
  const withoutCli = trimmed.slice(`${CLIENT_CODE_PREFIX}-`.length);
  const dash = withoutCli.indexOf("-");
  if (dash <= 0) return null;
  const suffix = withoutCli.slice(dash + 1);
  return isValidClientCodeSuffix(suffix) ? suffix : null;
}
