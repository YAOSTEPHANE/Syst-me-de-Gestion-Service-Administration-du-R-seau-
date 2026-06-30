/** Statuts du référentiel Clients (module /clients). Fichier dédié pour éviter les soucis de chargement côté client. */
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

/** Préfixe des identifiants clients attribués automatiquement à la création (ex. CLI-000042). */
export const CLIENT_CODE_PREFIX = "CLI";
