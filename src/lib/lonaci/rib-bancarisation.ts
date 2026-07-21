import { type BancarisationStatut } from "@/lib/lonaci/constants";
import {
  bancarisationStatutFields,
  normalizeBancarisationStatut,
} from "@/lib/lonaci/bancarisation-statut";
import { appendAuditLog } from "@/lib/lonaci/audit";
import { assertConcessionnaireOperationnel, canReadConcessionnaire } from "@/lib/lonaci/access";
import {
  addPieceJointe,
  findConcessionnaireById,
  updateConcessionnaire,
} from "@/lib/lonaci/concessionnaires";
import { notifyConcessionnaireRibDemande } from "@/lib/lonaci/rib-bancarisation-notify";
import type { ConcessionnaireDocument, PieceJointeDocument, UserDocument } from "@/lib/lonaci/types";
import { prisma } from "@/lib/prisma";

export {
  bancarisationStatutBadgeClass,
  bancarisationStatutDescription,
  bancarisationStatutFields,
  bancarisationStatutLabel,
  normalizeBancarisationStatut,
} from "@/lib/lonaci/bancarisation-statut";

function resolvedStatut(doc: ConcessionnaireDocument): BancarisationStatut {
  return normalizeBancarisationStatut(doc.statutBancarisation, doc.etatRib);
}

export function canCreateRibDemande(doc: ConcessionnaireDocument): boolean {
  return resolvedStatut(doc) === "NON_BANCARISE";
}

export function canAttachRib(doc: ConcessionnaireDocument): boolean {
  return resolvedStatut(doc) === "EN_ATTENTE_RIB";
}

export function canValidateRib(doc: ConcessionnaireDocument): boolean {
  return resolvedStatut(doc) === "RIB_FOURNI";
}

export function canIntegrateBancarisation(doc: ConcessionnaireDocument): boolean {
  return resolvedStatut(doc) === "RIB_VALIDE";
}

export async function createRibDemande(input: {
  concessionnaireId: string;
  actor: UserDocument;
  notifyEmail: boolean;
  notifySms: boolean;
}) {
  const doc = await findConcessionnaireById(input.concessionnaireId);
  if (!doc || doc.deletedAt) throw new Error("CONCESSIONNAIRE_NOT_FOUND");
  if (!canReadConcessionnaire(input.actor, doc)) throw new Error("FORBIDDEN");
  assertConcessionnaireOperationnel(doc);
  if (!canCreateRibDemande(doc)) throw new Error("RIB_DEMANDE_NOT_ALLOWED");

  const now = new Date();
  await prisma.concessionnaire.updateMany({
    where: { id: input.concessionnaireId, deletedAt: null },
    data: {
      statutBancarisation: "EN_ATTENTE_RIB",
      etatRib: null,
      ribDemandeAt: now,
      ribFourniAt: null,
      ribValideAt: null,
      ribPieceId: null,
      updatedByUserId: input.actor._id ?? "",
      updatedAt: now,
    },
  });

  const notify = await notifyConcessionnaireRibDemande({
    concessionnaireId: input.concessionnaireId,
    codePdv: doc.codePdv,
    nomComplet: doc.nomComplet,
    email: doc.email,
    telephone: doc.telephonePrincipal ?? doc.telephone,
    actorUserId: input.actor._id ?? "",
    channels: { email: input.notifyEmail, sms: input.notifySms },
  });

  await appendAuditLog({
    entityType: "CONCESSIONNAIRE",
    entityId: input.concessionnaireId,
    action: "RIB_DEMANDE",
    userId: input.actor._id ?? "",
    details: { statutBancarisation: "EN_ATTENTE_RIB", notify },
  });

  const updated = await findConcessionnaireById(input.concessionnaireId);
  if (!updated) throw new Error("CONCESSIONNAIRE_NOT_FOUND");
  return { concessionnaire: updated, notify };
}

export async function attachRibPiece(input: {
  concessionnaireId: string;
  piece: PieceJointeDocument;
  actor: UserDocument;
}) {
  const doc = await findConcessionnaireById(input.concessionnaireId);
  if (!doc || doc.deletedAt) throw new Error("CONCESSIONNAIRE_NOT_FOUND");
  if (!canReadConcessionnaire(input.actor, doc)) throw new Error("FORBIDDEN");
  if (!canAttachRib(doc)) throw new Error("RIB_ATTACH_NOT_ALLOWED");

  await addPieceJointe(input.concessionnaireId, input.piece, input.actor);

  const now = new Date();
  await prisma.concessionnaire.updateMany({
    where: { id: input.concessionnaireId, deletedAt: null },
    data: {
      statutBancarisation: "RIB_FOURNI",
      etatRib: null,
      ribFourniAt: now,
      ribPieceId: input.piece.id,
      updatedByUserId: input.actor._id ?? "",
      updatedAt: now,
    },
  });

  await appendAuditLog({
    entityType: "CONCESSIONNAIRE",
    entityId: input.concessionnaireId,
    action: "RIB_FOURNI",
    userId: input.actor._id ?? "",
    details: { pieceId: input.piece.id, filename: input.piece.filename },
  });

  const updated = await findConcessionnaireById(input.concessionnaireId);
  if (!updated) throw new Error("CONCESSIONNAIRE_NOT_FOUND");
  return updated;
}

export async function validateRib(input: {
  concessionnaireId: string;
  compteBancaire?: string | null;
  banqueEtablissement?: string | null;
  actor: UserDocument;
}) {
  const doc = await findConcessionnaireById(input.concessionnaireId);
  if (!doc || doc.deletedAt) throw new Error("CONCESSIONNAIRE_NOT_FOUND");
  if (!canReadConcessionnaire(input.actor, doc)) throw new Error("FORBIDDEN");
  if (!canValidateRib(doc)) throw new Error("RIB_VALIDATE_NOT_ALLOWED");

  const now = new Date();
  const patch: Parameters<typeof updateConcessionnaire>[1] = {};
  if (input.compteBancaire !== undefined) patch.compteBancaire = input.compteBancaire;
  if (input.banqueEtablissement !== undefined) patch.banqueEtablissement = input.banqueEtablissement;

  await prisma.concessionnaire.updateMany({
    where: { id: input.concessionnaireId, deletedAt: null },
    data: {
      statutBancarisation: "RIB_VALIDE",
      etatRib: null,
      ribValideAt: now,
      ...(input.compteBancaire !== undefined ? { compteBancaire: input.compteBancaire } : {}),
      ...(input.banqueEtablissement !== undefined ? { banqueEtablissement: input.banqueEtablissement } : {}),
      updatedByUserId: input.actor._id ?? "",
      updatedAt: now,
    },
  });

  if (Object.keys(patch).length > 0) {
    await updateConcessionnaire(input.concessionnaireId, patch, input.actor);
  }

  await appendAuditLog({
    entityType: "CONCESSIONNAIRE",
    entityId: input.concessionnaireId,
    action: "RIB_VALIDE",
    userId: input.actor._id ?? "",
    details: { statutBancarisation: "RIB_VALIDE" },
  });

  const updated = await findConcessionnaireById(input.concessionnaireId);
  if (!updated) throw new Error("CONCESSIONNAIRE_NOT_FOUND");
  return updated;
}

export async function integrateBancarisation(input: {
  concessionnaireId: string;
  compteBancaire: string;
  banqueEtablissement?: string | null;
  actor: UserDocument;
}) {
  const doc = await findConcessionnaireById(input.concessionnaireId);
  if (!doc || doc.deletedAt) throw new Error("CONCESSIONNAIRE_NOT_FOUND");
  if (!canReadConcessionnaire(input.actor, doc)) throw new Error("FORBIDDEN");
  if (!canIntegrateBancarisation(doc)) throw new Error("BANCARISATION_INTEGRATE_NOT_ALLOWED");

  const compte = input.compteBancaire.trim();
  if (!compte) throw new Error("COMPTE_BANCAIRE_REQUIRED");

  const now = new Date();
  await prisma.concessionnaire.updateMany({
    where: { id: input.concessionnaireId, deletedAt: null },
    data: {
      statutBancarisation: "BANCARISE",
      etatRib: null,
      bancariseAt: now,
      compteBancaire: compte,
      banqueEtablissement: input.banqueEtablissement?.trim() || doc.banqueEtablissement,
      updatedByUserId: input.actor._id ?? "",
      updatedAt: now,
    },
  });

  await appendAuditLog({
    entityType: "CONCESSIONNAIRE",
    entityId: input.concessionnaireId,
    action: "BANCARISATION_INTEGREE",
    userId: input.actor._id ?? "",
    details: {
      statutBancarisation: "BANCARISE",
      bancariseAt: now.toISOString(),
    },
  });

  const updated = await findConcessionnaireById(input.concessionnaireId);
  if (!updated) throw new Error("CONCESSIONNAIRE_NOT_FOUND");
  return updated;
}

export function sanitizeRibWorkflowPublic(doc: ConcessionnaireDocument) {
  const statut = resolvedStatut(doc);
  const meta = bancarisationStatutFields(doc.statutBancarisation, doc.etatRib);
  return {
    statutBancarisation: statut,
    statutBancarisationLabel: meta.statutBancarisationLabel,
    statutBancarisationDescription: meta.statutBancarisationDescription,
    ribDemandeAt: doc.ribDemandeAt?.toISOString() ?? null,
    ribFourniAt: doc.ribFourniAt?.toISOString() ?? null,
    ribValideAt: doc.ribValideAt?.toISOString() ?? null,
    bancariseAt: doc.bancariseAt?.toISOString() ?? null,
    ribPieceId: doc.ribPieceId,
    canCreateDemande: canCreateRibDemande(doc),
    canAttachRib: canAttachRib(doc),
    canValidateRib: canValidateRib(doc),
    canIntegrate: canIntegrateBancarisation(doc),
    /** @deprecated */
    etatRib:
      statut === "EN_ATTENTE_RIB" || statut === "RIB_FOURNI" || statut === "RIB_VALIDE" ? statut : null,
    etatRibLabel: meta.statutBancarisationLabel,
  };
}
