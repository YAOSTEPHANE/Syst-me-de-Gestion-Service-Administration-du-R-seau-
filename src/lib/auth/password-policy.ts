import type { LonaciRole } from "@/lib/lonaci/constants";
import type { UserDocument } from "@/lib/lonaci/types";

/**
 * La rotation mensuelle obligatoire ne s’applique qu’aux comptes administration (chef·fe de service).
 */
export function isSubjectToMonthlyPasswordRotationPolicy(role: LonaciRole): boolean {
  return role === "CHEF_SERVICE";
}

/** Mois civil UTC au format `YYYY-MM` (pour idempotence des rappels fin de mois). */
export function formatUtcYearMonth(d: Date): string {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  return `${y}-${m < 10 ? `0${m}` : m}`;
}

/** Indique si la date donnée est le dernier jour du mois civil en UTC (ex. 30 avril, 28 ou 29 février). */
export function isLastUtcDayOfMonth(now: Date = new Date()): boolean {
  const nextUtcDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return nextUtcDay.getUTCMonth() !== now.getUTCMonth();
}

/** Durée de validité du lien envoyé par le cron de fin de mois (7 jours). */
export const MONTHLY_PASSWORD_RESET_TOKEN_MS = 7 * 24 * 60 * 60 * 1000;

/** Début du mois civil courant (UTC), minuit inclus. */
export function startOfCurrentUtcMonth(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
}

/**
 * Politique métier : pour les comptes {@link isSubjectToMonthlyPasswordRotationPolicy},
 * le mot de passe doit être renouvelé au moins une fois depuis le 1er du mois civil (UTC).
 * Référence temporelle : `passwordChangedAt` si présent, sinon `createdAt` (comptes historiques sans date de changement).
 */
export function userRequiresPasswordRotation(
  user: Pick<UserDocument, "passwordChangedAt" | "createdAt" | "role">,
): boolean {
  if (!isSubjectToMonthlyPasswordRotationPolicy(user.role)) return false;
  const changedAt = user.passwordChangedAt ?? user.createdAt;
  return changedAt < startOfCurrentUtcMonth();
}

/** Routes API où l’utilisateur doit pouvoir agir malgré la rotation obligatoire (changement MDP ou lecture profil). */
export function isApiPathExemptFromPasswordRotation(pathname: string): boolean {
  const p = pathname.toLowerCase();
  if (p === "/api/auth/me") return true;
  if (p === "/api/auth/reset-password") return true;
  /** Catalogue agences / produits (GET uniquement côté route) — évite des 403 inutiles dans les formulaires. */
  if (p === "/api/referentials") return true;
  return false;
}
