import type { Prisma } from "@prisma/client";
import { ObjectId } from "mongodb";

import type { LonaciRole } from "@/lib/lonaci/constants";
import { LONACI_ROLES, CONCESSIONNAIRE_STATUTS_BLOQUANTS } from "@/lib/lonaci/constants";
import { canUseConcessionnaireOperationnel } from "@/lib/lonaci/concessionnaire-inscription";
import { findConcessionnaireById } from "@/lib/lonaci/concessionnaires";
import { listAgences } from "@/lib/lonaci/referentials";
import type { AgenceDocument, ConcessionnaireDocument, UserDocument } from "@/lib/lonaci/types";

/** Même normalisation que sur POST /api/clients (codes / libellés vs id Mongo). */
export function normalizeAgenceScopeToken(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[\s/-]+/g, "_");
}

export function userHasNationalScope(user: UserDocument): boolean {
  // CHEF_SERVICE historiquement en portée nationale si agenceId absente.
  // Si une liste d’agences autorisées est définie, on applique la liste (portée non-nationale).
  if (user.role !== "CHEF_SERVICE") return false;
  if (user.agenceId !== null) return false;
  if (user.agencesAutorisees && user.agencesAutorisees.length > 0) return false;
  return true;
}

/** Accès métier au périmètre agence (référentiel PDV). */
export function userMatchesAgence(user: UserDocument, agenceId: string | null): boolean {
  if (userHasNationalScope(user)) {
    return true;
  }

  // Si une liste d’agences autorisées est définie, elle prime.
  if (user.agencesAutorisees && user.agencesAutorisees.length > 0) {
    return agenceId !== null && user.agencesAutorisees.includes(agenceId);
  }

  // Fallback historique : si pas d’agence de rattachement, autoriser (cas legacy).
  if (!user.agenceId) {
    return true;
  }
  return agenceId !== null && user.agenceId === agenceId;
}

export function canReadConcessionnaire(user: UserDocument, doc: ConcessionnaireDocument): boolean {
  return userMatchesAgence(user, doc.agenceId);
}

export function canReadClient(user: UserDocument, doc: { agenceId: string | null }): boolean {
  return userMatchesAgence(user, doc.agenceId);
}

/**
 * Lecture fiche client : aligné sur le référentiel agences (codes / libellés dans le profil utilisateur).
 */
export function canReadClientWithAgences(
  user: UserDocument,
  doc: { agenceId: string | null },
  agences: AgenceDocument[],
): boolean {
  if (userHasNationalScope(user)) {
    return true;
  }
  const agenceId = doc.agenceId;
  const norm = normalizeAgenceScopeToken;
  if (agenceId === null) {
    if (!user.agenceId && (!user.agencesAutorisees || user.agencesAutorisees.length === 0)) {
      return true;
    }
    return false;
  }
  const trimmedAutorisations = (user.agencesAutorisees ?? []).map((s) => s.trim()).filter(Boolean);
  if (trimmedAutorisations.length > 0) {
    const ag = agences.find((a) => a._id === agenceId);
    if (!ag) {
      return trimmedAutorisations.includes(agenceId);
    }
    const set = new Set([norm(ag._id!), norm(ag.code), norm(ag.libelle)]);
    return trimmedAutorisations.some((v) => set.has(norm(v))) || trimmedAutorisations.includes(agenceId);
  }
  if (!user.agenceId) {
    return true;
  }
  const ag = agences.find((a) => a._id === agenceId);
  if (!ag) {
    return user.agenceId === agenceId;
  }
  const set = new Set([norm(ag._id!), norm(ag.code), norm(ag.libelle)]);
  return set.has(norm(user.agenceId)) || user.agenceId === agenceId;
}

export async function canReadClientDirectory(
  user: UserDocument,
  doc: { agenceId: string | null },
): Promise<boolean> {
  const agences = await listAgences();
  return canReadClientWithAgences(user, doc, agences);
}

/** Résout un jeton utilisateur (id, code ou libellé) vers l’`_id` Mongo d’une agence du référentiel. */
export function resolveAgenceMongoIdFromToken(token: string, agences: AgenceDocument[]): string | null {
  const norm = normalizeAgenceScopeToken;
  const t = token.trim();
  if (!t) return null;
  for (const ag of agences) {
    const id = ag._id?.trim();
    if (!id) continue;
    if (id === t) return id;
    const set = new Set([norm(id), norm(ag.code), norm(ag.libelle)]);
    if (set.has(norm(t))) return id;
  }
  return ObjectId.isValid(t) ? t : null;
}

/** Ids Mongo des agences visibles pour le référentiel clients (liste / filtres Prisma). */
export function resolveAllowedClientAgenceMongoIds(
  user: UserDocument,
  agences: AgenceDocument[],
): string[] | null {
  if (userHasNationalScope(user)) {
    return null;
  }
  const norm = normalizeAgenceScopeToken;
  const trimmedAutorisations = (user.agencesAutorisees ?? []).map((s) => s.trim()).filter(Boolean);

  if (trimmedAutorisations.length > 0) {
    const allowed = new Set<string>();
    for (const ag of agences) {
      const id = ag._id?.trim();
      if (!id) continue;
      const set = new Set([norm(id), norm(ag.code), norm(ag.libelle)]);
      if (trimmedAutorisations.some((v) => set.has(norm(v)))) {
        allowed.add(id);
      }
    }
    for (const t of trimmedAutorisations) {
      if (ObjectId.isValid(t) && agences.some((a) => a._id === t)) {
        allowed.add(t);
      }
    }
    if (allowed.size > 0) {
      return [...allowed];
    }
    const primary = user.agenceId?.trim()
      ? resolveAgenceMongoIdFromToken(user.agenceId, agences) ?? user.agenceId.trim()
      : null;
    if (primary) {
      return [primary];
    }
    return trimmedAutorisations;
  }

  if (!user.agenceId?.trim()) {
    return null;
  }
  const resolved = resolveAgenceMongoIdFromToken(user.agenceId, agences);
  if (resolved) {
    return [resolved];
  }
  return [user.agenceId.trim()];
}

/**
 * Filtre Prisma pour la liste clients : périmètre agence + résolution code/libellé → id Mongo.
 * (Ne pas réutiliser {@link concessionnaireListScopeAgenceId}, qui ignore `agencesAutorisees`.)
 */
export async function buildClientAgenceReadScopeWhere(user: UserDocument): Promise<Prisma.LonaciClientWhereInput> {
  const agences = await listAgences();
  const ids = resolveAllowedClientAgenceMongoIds(user, agences);
  if (ids === null) {
    return {};
  }
  if (ids.length === 0) {
    return { agenceId: { in: [] } };
  }

  const mongoIds = new Set<string>();
  const alternateAgenceKeys = new Set<string>();
  for (const raw of ids) {
    const id = raw.trim();
    if (!id) continue;
    const ag = agences.find((a) => a._id === id);
    if (ag) {
      mongoIds.add(id);
      if (ag.code?.trim()) alternateAgenceKeys.add(ag.code.trim());
    } else if (ObjectId.isValid(id)) {
      mongoIds.add(id);
    } else {
      alternateAgenceKeys.add(id);
    }
  }

  const orBranches: Prisma.LonaciClientWhereInput[] = [];
  if (mongoIds.size === 1) {
    orBranches.push({ agenceId: [...mongoIds][0] });
  } else if (mongoIds.size > 1) {
    orBranches.push({ agenceId: { in: [...mongoIds] } });
  }
  if (alternateAgenceKeys.size > 0) {
    orBranches.push({ agenceId: { in: [...alternateAgenceKeys] } });
  }

  if (orBranches.length === 0) {
    return ids.length === 1 ? { agenceId: ids[0] } : { agenceId: { in: ids } };
  }
  if (orBranches.length === 1) {
    return orBranches[0]!;
  }
  return { OR: orBranches };
}

/** Saisie / mise à jour fiche client (hors désactivation : rôles API dédiés). */
export async function canMutateClientCore(
  user: UserDocument,
  doc: { agenceId: string | null },
): Promise<boolean> {
  const agences = await listAgences();
  if (!canReadClientWithAgences(user, doc, agences)) return false;
  if (
    user.role === "LECTURE_SEULE" ||
    user.role === "AUDITEUR" ||
    user.role === "SUPERVISEUR_REGIONAL"
  ) {
    return false;
  }
  return true;
}

/** Pièces jointes cession : accès si le périmètre national, ou si au moins un PDV lié est lisible. */
export async function canReadCessionScopeForUser(
  user: UserDocument,
  scope: { concessionnaireId: string | null; cedantId: string | null; beneficiaireId: string | null },
): Promise<boolean> {
  if (userHasNationalScope(user)) {
    return true;
  }
  const ids = [scope.concessionnaireId, scope.cedantId, scope.beneficiaireId].filter((x): x is string =>
    Boolean(x),
  );
  for (const id of ids) {
    const c = await findConcessionnaireById(id);
    if (c && !c.deletedAt && canReadConcessionnaire(user, c)) {
      return true;
    }
  }
  return false;
}

export function canCreateConcessionnaireForAgence(
  user: UserDocument,
  agenceId: string | null,
): boolean {
  if (user.role === "CHEF_SERVICE") {
    return userMatchesAgence(user, agenceId);
  }
  if (user.role === "ASSIST_CDS") {
    if (user.agenceId) {
      return agenceId !== null && user.agenceId === agenceId;
    }
    return true;
  }
  if (user.role === "AGENT" || user.role === "CHEF_SECTION") {
    if (user.agenceId) {
      return agenceId === user.agenceId;
    }
    if (user.agencesAutorisees.length > 0) {
      return agenceId !== null && user.agencesAutorisees.includes(agenceId);
    }
    return false;
  }
  return false;
}

export function enforcedAgenceIdOnCreate(user: UserDocument, requestedAgenceId: string | null): string | null {
  if (user.role === "AGENT" || user.role === "CHEF_SECTION") {
    if (user.agenceId) {
      return user.agenceId;
    }
    if (user.agencesAutorisees.length === 1) {
      return user.agencesAutorisees[0] ?? null;
    }
    return requestedAgenceId;
  }
  if (user.role === "ASSIST_CDS" && user.agenceId) {
    return user.agenceId;
  }
  return requestedAgenceId;
}

export function isStatutBloquant(
  statut: ConcessionnaireDocument["statut"],
): boolean {
  return (CONCESSIONNAIRE_STATUTS_BLOQUANTS as readonly string[]).includes(statut);
}

/** Inscription non finalisée (caution payée) : modules contrat / dossier / etc. interdits. */
export function assertConcessionnaireOperationnel(doc: ConcessionnaireDocument): void {
  if (!canUseConcessionnaireOperationnel(doc)) {
    if (doc.statut === "RESILIE" || doc.statut === "DECEDE") {
      throw new Error("CONCESSIONNAIRE_BLOQUE");
    }
    throw new Error("CONCESSIONNAIRE_INSCRIPTION_PENDING");
  }
}

/**
 * Résilié / décédé : pas de mutation métier (sauf notes internes réservées CHEF_SERVICE).
 * INACTIF (désactivation) reste éditable pour permettre la réactivation — pas de suppression définitive.
 */
export function isStatutFicheGelee(statut: ConcessionnaireDocument["statut"]): boolean {
  return statut === "RESILIE" || statut === "DECEDE";
}

export function canMutateConcessionnaireCore(
  user: UserDocument,
  doc: ConcessionnaireDocument,
): boolean {
  if (!canReadConcessionnaire(user, doc)) {
    return false;
  }
  if (!isStatutFicheGelee(doc.statut)) {
    return true;
  }
  return user.role === "CHEF_SERVICE";
}

/** Résilié / décédé : seules les notes internes restent modifiables (tout profil avec accès fiche). */
export function canEditNotesInternesWhenBlocked(user: UserDocument): boolean {
  return (LONACI_ROLES as readonly string[]).includes(user.role);
}

export function rolesAllowedConcessionnaireWrite(): LonaciRole[] {
  return ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"];
}
