/** Statuts du référentiel Clients (module /clients). Fichier dédié pour éviter les soucis de chargement côté client. */
export const CLIENT_STATUTS = ["ACTIF", "INACTIF"] as const;
export type ClientStatut = (typeof CLIENT_STATUTS)[number];

export const CLIENT_STATUT_LABELS: Record<ClientStatut, string> = {
  ACTIF: "Actif",
  INACTIF: "Inactif",
};

/** Préfixe des identifiants clients attribués automatiquement à la création (ex. CLI-000042). */
export const CLIENT_CODE_PREFIX = "CLI";
