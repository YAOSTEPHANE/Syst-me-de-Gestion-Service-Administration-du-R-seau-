import "server-only";

import { findConcessionnaireBySourceClientId } from "@/lib/lonaci/client-to-concessionnaire";
import { findLonaciClientById } from "@/lib/lonaci/clients";

/** Résout l’ID concessionnaire lié à un client (après promotion PDV). */
export async function concessionnaireIdForLonaciClient(clientId: string): Promise<string | null> {
  const id = clientId.trim();
  if (!id) return null;
  const pdv = await findConcessionnaireBySourceClientId(id);
  return pdv?._id ?? null;
}

export async function requireLonaciClient(clientId: string): Promise<void> {
  const client = await findLonaciClientById(clientId.trim());
  if (!client) throw new Error("CLIENT_NOT_FOUND");
}

/** Exige un PDV déjà créé pour ce client (succession, résiliation, etc.). */
export async function requireConcessionnaireForLonaciClient(clientId: string): Promise<string> {
  await requireLonaciClient(clientId);
  const pdvId = await concessionnaireIdForLonaciClient(clientId);
  if (!pdvId) throw new Error("CLIENT_NOT_PROMOTED");
  return pdvId;
}

/**
 * Lit `lonaciClientId` ou `concessionnaireId` (legacy) depuis un corps de requête.
 * Priorité au client lorsque les deux sont fournis.
 */
export async function resolveFormPartyIds(input: {
  lonaciClientId?: string | null;
  concessionnaireId?: string | null;
  requirePdv?: boolean;
}): Promise<{ lonaciClientId: string | null; concessionnaireId: string | null }> {
  const clientId = (input.lonaciClientId ?? "").trim() || null;
  const legacyPdv = (input.concessionnaireId ?? "").trim() || null;

  if (clientId) {
    const pdvId = await concessionnaireIdForLonaciClient(clientId);
    if (input.requirePdv && !pdvId) throw new Error("CLIENT_NOT_PROMOTED");
    return { lonaciClientId: clientId, concessionnaireId: pdvId };
  }

  if (legacyPdv) {
    return { lonaciClientId: null, concessionnaireId: legacyPdv };
  }

  if (input.requirePdv) throw new Error("CLIENT_REQUIRED");
  return { lonaciClientId: null, concessionnaireId: null };
}

/** Filtre liste : résout un client en ID concessionnaire pour les requêtes legacy. */
export async function listFilterConcessionnaireId(params: {
  lonaciClientId?: string;
  concessionnaireId?: string;
}): Promise<string | undefined> {
  const clientId = params.lonaciClientId?.trim();
  const legacy = params.concessionnaireId?.trim();
  if (clientId) {
    const resolved = await concessionnaireIdForLonaciClient(clientId);
    return resolved ?? "__none__";
  }
  return legacy || undefined;
}
