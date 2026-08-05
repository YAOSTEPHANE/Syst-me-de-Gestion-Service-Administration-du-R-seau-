import "server-only";

import { userDisplayName, type UserDocument } from "@/lib/lonaci/types";
import { findUserById } from "@/lib/lonaci/users";

const FALLBACK_AGENT = "Agent LONACI";

/**
 * Nom affiché de l’agent sur les fiches / PDF officiels LONACI.
 * Priorité : libellé déjà persisté → acteur courant → lookup userId → fallback.
 */
export async function resolveDocumentAgentName(input: {
  persistedName?: string | null;
  actor?: Pick<UserDocument, "prenom" | "nom" | "email" | "matricule"> | null;
  userId?: string | null;
}): Promise<string> {
  const persisted = input.persistedName?.trim();
  if (persisted) return persisted;
  if (input.actor) {
    const fromActor = userDisplayName(input.actor).trim();
    if (fromActor && fromActor !== "un utilisateur") return fromActor;
  }
  const userId = input.userId?.trim();
  if (userId) {
    const user = await findUserById(userId);
    if (user) {
      const fromUser = userDisplayName(user).trim();
      if (fromUser && fromUser !== "un utilisateur") return fromUser;
    }
  }
  return FALLBACK_AGENT;
}

export function documentAgentFallback(): string {
  return FALLBACK_AGENT;
}
