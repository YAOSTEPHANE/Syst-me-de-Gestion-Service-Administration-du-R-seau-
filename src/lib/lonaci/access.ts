import type { LonaciRole } from "@/lib/lonaci/constants";
import { LONACI_ROLES, CONCESSIONNAIRE_STATUTS_BLOQUANTS } from "@/lib/lonaci/constants";
import type { ConcessionnaireDocument, UserDocument } from "@/lib/lonaci/types";

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
    if (!user.agenceId) {
      return false;
    }
    return agenceId === user.agenceId;
  }
  return false;
}

export function enforcedAgenceIdOnCreate(user: UserDocument, requestedAgenceId: string | null): string | null {
  if (user.role === "AGENT" || user.role === "CHEF_SECTION") {
    return user.agenceId;
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
