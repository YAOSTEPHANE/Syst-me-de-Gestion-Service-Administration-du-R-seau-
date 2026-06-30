import "server-only";

import { isClientStatutEligibleForPromotionConcessionnaire } from "@/lib/lonaci/client-constants";
import {
  findLonaciClientById,
  parseClientDocumentChecklist,
} from "@/lib/lonaci/clients";
import { createConcessionnaire } from "@/lib/lonaci/concessionnaires";
import { buildInscriptionChecklistForProducts } from "@/lib/lonaci/concessionnaire-inscription";
import type { BancarisationStatut } from "@/lib/lonaci/constants";
import { listProduits } from "@/lib/lonaci/referentials";
import { prisma } from "@/lib/prisma";
import type { ConcessionnaireDocument, UserDocument } from "@/lib/lonaci/types";

function isObjectId(id: string): boolean {
  return /^[a-f\d]{24}$/i.test(id);
}

export async function findConcessionnaireBySourceClientId(
  clientId: string,
): Promise<ConcessionnaireDocument | null> {
  if (!isObjectId(clientId)) return null;
  const row = await prisma.concessionnaire.findFirst({
    where: { sourceLonaciClientId: clientId, deletedAt: null },
  });
  if (!row) return null;
  const { findConcessionnaireById } = await import("@/lib/lonaci/concessionnaires");
  return findConcessionnaireById(row.id);
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

export async function createConcessionnaireFromClient(input: {
  sourceLonaciClientId: string;
  agenceCode: string;
  agenceId: string;
  codeTerminal?: string | null;
  codeConcessionnaire?: string | null;
  gps: { lat: number; lng: number };
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

  const identity = splitNomComplet(client.nomComplet);
  const nomComplet = (client.nomComplet ?? client.raisonSociale).trim();
  const produits = client.produitsAutorises ?? [];
  const produitRefs = await listProduits();
  const clientChecklist = parseClientDocumentChecklist(client.documentChecklist);
  const checklist = buildInscriptionChecklistForProducts(produits, produitRefs, clientChecklist);

  const created = await createConcessionnaire({
    nom: identity.nom || nomComplet,
    prenom: identity.prenom || nomComplet,
    nomComplet,
    codeTerminal: input.codeTerminal ?? null,
    codeConcessionnaire: input.codeConcessionnaire ?? null,
    cniNumero: client.cniNumero,
    photoUrl: null,
    email: client.email,
    telephonePrincipal: client.telephone,
    telephoneSecondaire: null,
    adresse: client.adresse,
    ville: client.ville,
    codePostal: client.codePostal,
    agenceId: input.agenceId,
    agenceCode: input.agenceCode,
    produitsAutorises: produits,
    statutBancarisation: (input.statutBancarisation ?? "NON_BANCARISE") as BancarisationStatut,
    compteBancaire: input.compteBancaire ?? null,
    banqueEtablissement: input.banqueEtablissement ?? null,
    gps: input.gps,
    observations: input.observations ?? client.notes,
    notesInternes: input.notesInternes ?? null,
    createdByUserId: input.actor._id ?? "",
    sourceLonaciClientId: input.sourceLonaciClientId,
    initialDocumentChecklist: checklist,
  });

  await prisma.lonaciClient.update({
    where: { id: client.id },
    data: {
      statut: "INACTIF",
      updatedByUserId: input.actor._id ?? "",
      updatedAt: new Date(),
    },
  });

  const { appendAuditLog } = await import("@/lib/lonaci/audit");
  await appendAuditLog({
    entityType: "CLIENT",
    entityId: client.id,
    action: "CLIENT_PROMOTED_TO_CONCESSIONNAIRE",
    userId: input.actor._id ?? "",
    details: { concessionnaireId: created._id, code: client.code },
  });

  return created;
}
