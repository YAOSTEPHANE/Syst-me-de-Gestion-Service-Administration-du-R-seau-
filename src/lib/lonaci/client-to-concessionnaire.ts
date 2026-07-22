import "server-only";

import { randomUUID } from "node:crypto";

import { isClientStatutEligibleForPromotionConcessionnaire } from "@/lib/lonaci/client-constants";
import {
  findLonaciClientById,
  parseClientDocumentChecklist,
} from "@/lib/lonaci/clients";
import { appendAuditLog } from "@/lib/lonaci/audit";
import {
  createConcessionnaire,
  findConcessionnaireById,
} from "@/lib/lonaci/concessionnaires";
import { buildInscriptionChecklistForProducts } from "@/lib/lonaci/concessionnaire-inscription";
import type { BancarisationStatut } from "@/lib/lonaci/constants";
import { getDatabase } from "@/lib/mongodb";
import { findAgenceById, listProduits } from "@/lib/lonaci/referentials";
import { findUserById } from "@/lib/lonaci/users";
import { prisma } from "@/lib/prisma";
import type {
  ConcessionnaireDocument,
  GpsPoint,
  UserDocument,
} from "@/lib/lonaci/types";

const PROMOTION_LOCKS_COLLECTION = "client_concessionnaire_promotion_locks";
const PROMOTION_LOCK_TTL_MS = 60_000;

type PromotionLockRecord = {
  _id: string;
  ownerId: string;
  expiresAt: Date;
};

type LonaciClientDocument = NonNullable<
  Awaited<ReturnType<typeof findLonaciClientById>>
>;

function isObjectId(id: string): boolean {
  return /^[a-f\d]{24}$/i.test(id);
}

/** Lit GPS / localisation / bancarisation stockés sur le payload d’un dossier contrat. */
export function parseContratPdvMetaFromPayload(payload: Record<string, unknown>): {
  gps: GpsPoint | null;
  commune: string | null;
  quartier: string | null;
  statutBancarisation?: string;
  compteBancaire: string | null;
} {
  let gps: GpsPoint | null = null;
  const rawGps = payload.gps;
  if (rawGps && typeof rawGps === "object" && !Array.isArray(rawGps)) {
    const lat = Number((rawGps as { lat?: unknown }).lat);
    const lng = Number((rawGps as { lng?: unknown }).lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      gps = { lat, lng };
    }
  }

  const communeRaw = payload.commune;
  const commune =
    typeof communeRaw === "string" && communeRaw.trim() ? communeRaw.trim() : null;

  const quartierRaw = payload.quartier;
  const quartier =
    typeof quartierRaw === "string" && quartierRaw.trim() ? quartierRaw.trim() : null;

  const statutRaw = payload.statutBancarisation;
  const statutBancarisation =
    typeof statutRaw === "string" && statutRaw.trim() ? statutRaw.trim() : undefined;

  const compteRaw = payload.compteBancaire;
  const compteBancaire =
    typeof compteRaw === "string" && compteRaw.trim() ? compteRaw.trim() : null;

  return { gps, commune, quartier, statutBancarisation, compteBancaire };
}

export async function findConcessionnaireBySourceClientId(
  clientId: string,
): Promise<ConcessionnaireDocument | null> {
  if (!isObjectId(clientId)) return null;
  const row = await prisma.concessionnaire.findFirst({
    where: { sourceLonaciClientId: clientId, deletedAt: null },
  });
  if (!row) return null;
  return await findConcessionnaireById(row.id);
}

/** Vérifie qu'un client a terminé son parcours avant promotion PDV. */
export async function assertClientEligibleForPromotion(clientId: string): Promise<void> {
  const client = await findLonaciClientById(clientId);
  if (!client) {
    throw new Error("CLIENT_NOT_FOUND");
  }
  if (!isClientStatutEligibleForPromotionConcessionnaire(client.statut)) {
    if (client.statut === "EN_ATTENTE_N1" || client.statut === "REJETE") {
      throw new Error("CLIENT_INSCRIPTION_PENDING");
    }
    if (client.statut === "DOSSIER_EN_COURS") {
      throw new Error("CLIENT_PARCOURS_INCOMPLET");
    }
    throw new Error("CLIENT_BLOQUE");
  }
  const existing = await findConcessionnaireBySourceClientId(clientId);
  if (existing) {
    throw new Error("CLIENT_ALREADY_PROMOTED");
  }
}

function splitNomComplet(nomComplet: string | null | undefined): { nom: string; prenom: string } {
  const full = (nomComplet ?? "").trim();
  if (!full) return { nom: "", prenom: "" };
  const parts = full.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { nom: parts[0]!, prenom: parts[0]! };
  return { nom: parts[parts.length - 1]!, prenom: parts.slice(0, -1).join(" ") };
}

async function createConcessionnaireFromResolvedClient(input: {
  client: LonaciClientDocument;
  agenceCode: string;
  agenceId: string;
  codeTerminal?: string | null;
  codeConcessionnaire?: string | null;
  gps: GpsPoint | null;
  commune?: string | null;
  quartier?: string | null;
  statutBancarisation?: string;
  compteBancaire?: string | null;
  banqueEtablissement?: string | null;
  observations?: string | null;
  notesInternes?: string | null;
  actor: UserDocument;
}): Promise<ConcessionnaireDocument> {
  const identity = splitNomComplet(input.client.nomComplet);
  const nomComplet = (input.client.nomComplet ?? input.client.raisonSociale).trim();
  const produits = input.client.produitsAutorises ?? [];
  const produitRefs = await listProduits();
  const clientChecklist = parseClientDocumentChecklist(input.client.documentChecklist);
  const checklist = buildInscriptionChecklistForProducts(produits, produitRefs, clientChecklist);

  const commune = (input.commune ?? "").trim() || null;
  const quartier = (input.quartier ?? "").trim() || null;
  const baseAdresse = (input.client.adresse ?? "").trim();
  const adresseParts = [quartier ? `Quartier ${quartier}` : null, baseAdresse || null].filter(
    Boolean,
  ) as string[];

  const created = await createConcessionnaire({
    nom: identity.nom || nomComplet,
    prenom: identity.prenom || nomComplet,
    nomComplet,
    codeTerminal: input.codeTerminal ?? null,
    codeConcessionnaire: input.codeConcessionnaire ?? null,
    cniNumero: input.client.cniNumero,
    photoUrl: null,
    email: input.client.email,
    telephonePrincipal: input.client.telephone,
    telephoneSecondaire: null,
    adresse: adresseParts.length ? adresseParts.join(" — ") : null,
    ville: commune || input.client.ville,
    codePostal: input.client.codePostal,
    agenceId: input.agenceId,
    agenceCode: input.agenceCode,
    produitsAutorises: produits,
    statutBancarisation: (input.statutBancarisation ?? "NON_BANCARISE") as BancarisationStatut,
    compteBancaire: input.compteBancaire ?? null,
    banqueEtablissement: input.banqueEtablissement ?? null,
    gps: input.gps,
    observations: input.observations ?? input.client.notes,
    notesInternes: input.notesInternes ?? null,
    createdByUserId: input.actor._id ?? "",
    sourceLonaciClientId: input.client.id,
    initialDocumentChecklist: checklist,
  });

  await prisma.lonaciClient.update({
    where: { id: input.client.id },
    data: {
      statut: "INACTIF",
      updatedByUserId: input.actor._id ?? "",
      updatedAt: new Date(),
    },
  });

  await appendAuditLog({
    entityType: "CLIENT",
    entityId: input.client.id,
    action: "CLIENT_PROMOTED_TO_CONCESSIONNAIRE",
    userId: input.actor._id ?? "",
    details: { concessionnaireId: created._id, code: input.client.code },
  });

  return created;
}

export async function createConcessionnaireFromClient(input: {
  sourceLonaciClientId: string;
  agenceCode: string;
  agenceId: string;
  codeTerminal?: string | null;
  codeConcessionnaire?: string | null;
  gps: GpsPoint;
  statutBancarisation?: string;
  compteBancaire?: string | null;
  banqueEtablissement?: string | null;
  observations?: string | null;
  notesInternes?: string | null;
  actor: UserDocument;
}): Promise<ConcessionnaireDocument> {
  await assertClientEligibleForPromotion(input.sourceLonaciClientId);
  const client = await findLonaciClientById(input.sourceLonaciClientId);
  if (!client) throw new Error("CLIENT_NOT_FOUND");

  return await createConcessionnaireFromResolvedClient({
    ...input,
    client,
  });
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 11000
  );
}

async function acquirePromotionLock(clientId: string): Promise<string> {
  const ownerId = randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + PROMOTION_LOCK_TTL_MS);
  const db = await getDatabase();
  try {
    await db.collection<PromotionLockRecord>(PROMOTION_LOCKS_COLLECTION).updateOne(
      {
        _id: clientId,
        expiresAt: { $lte: now },
      },
      {
        $set: { ownerId, expiresAt },
      },
      { upsert: true },
    );
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new Error("CLIENT_PROMOTION_IN_PROGRESS");
    }
    throw error;
  }
  return ownerId;
}

async function releasePromotionLock(clientId: string, ownerId: string): Promise<void> {
  const db = await getDatabase();
  await db
    .collection<PromotionLockRecord>(PROMOTION_LOCKS_COLLECTION)
    .deleteOne({ _id: clientId, ownerId });
}

/**
 * Promotion déclenchée après signature : idempotente, GPS facultatif et statuts
 * autorisés limités à DOSSIER_EN_COURS / ACTIF.
 */
export async function promoteSignedDossierClient(input: {
  sourceLonaciClientId: string;
  dossierAgenceId: string | null;
  actorUserId: string;
  gps?: GpsPoint | null;
  commune?: string | null;
  quartier?: string | null;
  statutBancarisation?: string;
  compteBancaire?: string | null;
}): Promise<{ concessionnaire: ConcessionnaireDocument; created: boolean }> {
  const existing = await findConcessionnaireBySourceClientId(input.sourceLonaciClientId);
  if (existing) {
    return { concessionnaire: existing, created: false };
  }

  const ownerId = await acquirePromotionLock(input.sourceLonaciClientId);
  try {
    const existingAfterLock = await findConcessionnaireBySourceClientId(
      input.sourceLonaciClientId,
    );
    if (existingAfterLock) {
      return { concessionnaire: existingAfterLock, created: false };
    }

    const client = await findLonaciClientById(input.sourceLonaciClientId);
    if (!client) {
      throw new Error("CLIENT_NOT_FOUND");
    }
    if (client.statut !== "DOSSIER_EN_COURS" && client.statut !== "ACTIF") {
      if (client.statut === "EN_ATTENTE_N1" || client.statut === "REJETE") {
        throw new Error("CLIENT_INSCRIPTION_PENDING");
      }
      throw new Error("CLIENT_BLOQUE");
    }

    const agenceId = input.dossierAgenceId?.trim() || client.agenceId?.trim() || "";
    if (!agenceId) {
      throw new Error("AGENCE_REQUIRED");
    }
    const agence = await findAgenceById(agenceId);
    if (!agence || agence.code.trim().length < 2) {
      throw new Error("AGENCE_INVALID");
    }
    if (!agence.actif) {
      throw new Error("AGENCE_INACTIVE");
    }

    const actor = await findUserById(input.actorUserId);
    if (!actor) {
      throw new Error("SIGN_ACTOR_NOT_FOUND");
    }

    const concessionnaire = await createConcessionnaireFromResolvedClient({
      client,
      agenceId,
      agenceCode: agence.code.trim().toUpperCase(),
      gps: input.gps ?? null,
      commune: input.commune,
      quartier: input.quartier,
      statutBancarisation: input.statutBancarisation,
      compteBancaire: input.compteBancaire,
      actor,
    });
    return { concessionnaire, created: true };
  } finally {
    await releasePromotionLock(input.sourceLonaciClientId, ownerId);
  }
}
