/**
 * Circuit de validation des soumissions (modèle caution, un seul niveau : chef de service).
 * Démarre à l'émission de la fiche de paiement caisse ; la file d'appels reste indépendante.
 */

export const SOUMISSION_CIRCUIT_STATUTS = [
  "EN_ATTENTE",
  "A_CORRIGER",
  "PAYEE",
  "ANNULEE",
  "EXONEREE",
] as const;

export type SoumissionCircuitStatut = (typeof SOUMISSION_CIRCUIT_STATUTS)[number];

/** Circuit ouvert : paiement non encore validé. */
export const SOUMISSION_CIRCUIT_OUVERTS = ["EN_ATTENTE", "A_CORRIGER"] as const;

/** Circuit clos : plus aucune modification ni fiche caisse. */
export const SOUMISSION_CIRCUIT_CLOS = ["PAYEE", "ANNULEE", "EXONEREE"] as const;

/** Statuts comptés comme « validés » (onglet du mois). */
export const SOUMISSION_CIRCUIT_VALIDES = ["PAYEE", "EXONEREE"] as const;

export const SOUMISSION_PAIEMENT_DELAI_JOURS = 10;

/** Statut affiché : le retard J+10 est calculé, jamais stocké. */
export type SoumissionCircuitAffichage = SoumissionCircuitStatut | "EN_RETARD";

export const SOUMISSION_CIRCUIT_LABELS: Record<SoumissionCircuitAffichage, string> = {
  EN_ATTENTE: "En attente de validation",
  A_CORRIGER: "À corriger",
  EN_RETARD: `En retard J+${SOUMISSION_PAIEMENT_DELAI_JOURS}`,
  PAYEE: "Payée",
  ANNULEE: "Annulée",
  EXONEREE: "Exonérée",
};

export const SOUMISSION_CIRCUIT_TABS = [
  "TOUTES",
  "J10_OVERDUE",
  "EN_ATTENTE",
  "VALIDATED_THIS_MONTH",
] as const;

export type SoumissionCircuitTab = (typeof SOUMISSION_CIRCUIT_TABS)[number];

export const SOUMISSION_CIRCUIT_TAB_LABELS: Record<SoumissionCircuitTab, string> = {
  TOUTES: "Toutes",
  J10_OVERDUE: `En retard J+${SOUMISSION_PAIEMENT_DELAI_JOURS}`,
  EN_ATTENTE: "En attente de validation",
  VALIDATED_THIS_MONTH: "Validées ce mois",
};

export type SoumissionCircuitCounters = Record<Exclude<SoumissionCircuitTab, "TOUTES">, number>;

export type SoumissionCircuitActions = {
  ficheCaisse: boolean;
  finaliser: boolean;
  correction: boolean;
  exonerer: boolean;
  renvoyer: boolean;
  ficheDefinitive: boolean;
};

/** Référence imprimée sur la fiche de paiement caisse. */
export function soumissionFicheCaisseReference(soumissionId: string): string {
  return `SOU-${soumissionId.slice(-8).toUpperCase()}`;
}

const OPERATIONAL_ROLES = ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"] as const;

function isOperationalRole(role: string): boolean {
  return (OPERATIONAL_ROLES as readonly string[]).includes(role);
}

export function isSoumissionCircuitStatut(value: unknown): value is SoumissionCircuitStatut {
  return typeof value === "string" && (SOUMISSION_CIRCUIT_STATUTS as readonly string[]).includes(value);
}

export function isSoumissionCircuitClos(statut: SoumissionCircuitStatut | null | undefined): boolean {
  return Boolean(statut && (SOUMISSION_CIRCUIT_CLOS as readonly string[]).includes(statut));
}

/** Une fiche émise au plus tard à cette date est en retard. */
export function soumissionOverdueThreshold(now: Date): Date {
  return new Date(now.getTime() - SOUMISSION_PAIEMENT_DELAI_JOURS * 86_400_000);
}

/** Premier jour du mois courant (UTC = heure d'Abidjan). */
export function soumissionCurrentMonthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function resolveSoumissionCircuitAffichage(input: {
  circuitStatut: SoumissionCircuitStatut | null;
  circuitStartedAt: Date | string | null;
  now: Date;
}): SoumissionCircuitAffichage | null {
  const { circuitStatut } = input;
  if (!circuitStatut) return null;
  if (circuitStatut !== "EN_ATTENTE" && circuitStatut !== "A_CORRIGER") return circuitStatut;
  if (!input.circuitStartedAt) return circuitStatut;
  const started = new Date(input.circuitStartedAt);
  return started <= soumissionOverdueThreshold(input.now) ? "EN_RETARD" : circuitStatut;
}

/**
 * Actions autorisées pour un rôle.
 * `approvalsEnabled` = `areWorkflowApprovalsEnabled()` : sinon tout rôle opérationnel finalise
 * (mode simplifié), à l'exception de l'exonération, réservée au chef de service.
 */
export function resolveSoumissionCircuitActions(input: {
  role: string;
  circuitStatut: SoumissionCircuitStatut | null;
  approvalsEnabled: boolean;
}): SoumissionCircuitActions {
  const { role, circuitStatut } = input;
  const operational = isOperationalRole(role);
  const validator = input.approvalsEnabled ? role === "CHEF_SERVICE" : operational;
  const enAttente = circuitStatut === "EN_ATTENTE";
  return {
    ficheCaisse: operational && !isSoumissionCircuitClos(circuitStatut),
    finaliser: validator && enAttente,
    correction: validator && enAttente,
    exonerer: role === "CHEF_SERVICE" && enAttente,
    renvoyer: operational && circuitStatut === "A_CORRIGER",
    ficheDefinitive: circuitStatut === "PAYEE",
  };
}
