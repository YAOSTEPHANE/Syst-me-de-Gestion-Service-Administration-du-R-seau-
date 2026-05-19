import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import path from "node:path";
import { ObjectId } from "mongodb";

import { appendAuditLog } from "@/lib/lonaci/audit";
import { markActiveContratAsResilieForProduct } from "@/lib/lonaci/contracts";
import { findConcessionnaireById, updateConcessionnaire } from "@/lib/lonaci/concessionnaires";
import { notifyRoleTargets } from "@/lib/lonaci/notifications";
import { listProduits } from "@/lib/lonaci/referentials";
import {
  buildResiliationDocumentChecklist,
  isResiliationChecklistComplete,
  parseResiliationDocumentChecklist,
  patchResiliationDocumentChecklistStatuts,
} from "@/lib/lonaci/resiliation-document-checklist";
import { resiliationDisplayStatutFields } from "@/lib/lonaci/resiliation-statut-metier";
import {
  type DossierDocumentChecklistPayload,
  type DossierDocumentChecklistStatut,
  type UserDocument,
  userDisplayName,
} from "@/lib/lonaci/types";
import { getDatabase } from "@/lib/mongodb";
import { prisma } from "@/lib/prisma";

const COLLECTION = "resiliations";
const FILE_ROOT = path.join(process.cwd(), "storage", "lonaci", "resiliations");

export type ResiliationStatus =
  | "DOSSIER_RECU"
  | "CONTROLE_CHEF_SECTION"
  | "VALIDATION_N2"
  | "RESILIE"
  | "REJETEE";

export const RESILIATION_WORKFLOW_STATUTS: ResiliationStatus[] = [
  "DOSSIER_RECU",
  "CONTROLE_CHEF_SECTION",
  "VALIDATION_N2",
  "RESILIE",
  "REJETEE",
];

interface ResiliationAttachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  storedRelativePath: string;
  uploadedAt: Date;
  uploadedByUserId: string;
}

interface ResiliationStored {
  _id: ObjectId;
  concessionnaireId: string;
  produitCode: string;
  dateReception: Date;
  motif: string;
  statut: ResiliationStatus;
  commentaire: string | null;
  validatedAt: Date | null;
  validatedByUserId: string | null;
  contratId: string | null;
  contratReference: string | null;
  documentChecklist: DossierDocumentChecklistPayload | null;
  attachments: ResiliationAttachment[];
  createdByUserId: string;
  updatedByUserId: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface ResiliationListItem {
  id: string;
  concessionnaireId: string;
  produitCode: string;
  dateReception: string;
  motif: string;
  statut: ResiliationStatus;
  commentaire: string | null;
  validatedAt: string | null;
  contratId: string | null;
  contratReference: string | null;
  documentChecklist: DossierDocumentChecklistPayload | null;
  statutMetierLabel: string;
  statutMetierDescription: string;
  attachments: Array<{ id: string; filename: string; mimeType: string; size: number; uploadedAt: string }>;
  createdAt: string;
  updatedAt: string;
}

async function ensureRowDocumentChecklist(row: ResiliationStored): Promise<DossierDocumentChecklistPayload> {
  const parsed = parseResiliationDocumentChecklist(row.documentChecklist);
  if (parsed?.entries.length) return parsed;
  const produits = await listProduits();
  const built = buildResiliationDocumentChecklist(row.produitCode, produits);
  const db = await getDatabase();
  await db.collection<ResiliationStored>(COLLECTION).updateOne(
    { _id: row._id },
    { $set: { documentChecklist: built, updatedAt: new Date() } },
  );
  return built;
}

export { resiliationChecklistProgress } from "@/lib/lonaci/resiliations-checklist-progress";

function mapRow(row: ResiliationStored, documentChecklist: DossierDocumentChecklistPayload | null): ResiliationListItem {
  const display = resiliationDisplayStatutFields({
    statut: row.statut,
    checklistComplet: documentChecklist?.complet ?? null,
  });
  return {
    id: row._id.toHexString(),
    concessionnaireId: row.concessionnaireId,
    produitCode: row.produitCode,
    dateReception: row.dateReception.toISOString(),
    motif: row.motif,
    statut: row.statut,
    commentaire: row.commentaire,
    validatedAt: row.validatedAt ? row.validatedAt.toISOString() : null,
    contratId: row.contratId ?? null,
    contratReference: row.contratReference ?? null,
    documentChecklist,
    statutMetierLabel: display.statutMetierLabel,
    statutMetierDescription: display.statutMetierDescription,
    attachments: row.attachments.map((a) => ({
      id: a.id,
      filename: a.filename,
      mimeType: a.mimeType,
      size: a.size,
      uploadedAt: a.uploadedAt.toISOString(),
    })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function ensureResiliationIndexes() {
  const db = await getDatabase();
  await db.collection<ResiliationStored>(COLLECTION).createIndexes([
    { key: { statut: 1, updatedAt: -1 }, name: "idx_status_updated" },
    { key: { concessionnaireId: 1, produitCode: 1 }, name: "idx_concessionnaire_produit" },
    { key: { dateReception: -1 }, name: "idx_date_reception" },
  ]);
}

export async function createResiliation(input: {
  concessionnaireId: string;
  produitCode: string;
  dateReception: Date;
  motif: string;
  commentaire?: string | null;
  actor: UserDocument;
}) {
  if (!input.actor._id) throw new Error("ACTOR_REQUIRED");
  const actionBy = userDisplayName(input.actor);
  const concessionnaire = await findConcessionnaireById(input.concessionnaireId);
  if (!concessionnaire || concessionnaire.deletedAt) throw new Error("CONCESSIONNAIRE_NOT_FOUND");
  if (concessionnaire.statut === "RESILIE") throw new Error("CONCESSIONNAIRE_ALREADY_RESILIE");

  const activeContract = await prisma.contrat.findFirst({
    where: {
      concessionnaireId: input.concessionnaireId,
      produitCode: input.produitCode.trim().toUpperCase(),
      status: "ACTIF",
      deletedAt: null,
    },
    select: { id: true },
  });
  if (!activeContract) throw new Error("ACTIVE_CONTRAT_REQUIRED");

  const produits = await listProduits();
  const documentChecklist = buildResiliationDocumentChecklist(input.produitCode, produits);

  const db = await getDatabase();
  const now = new Date();
  const doc: Omit<ResiliationStored, "_id"> = {
    concessionnaireId: input.concessionnaireId,
    produitCode: input.produitCode.trim().toUpperCase(),
    dateReception: input.dateReception,
    motif: input.motif.trim(),
    statut: "DOSSIER_RECU",
    commentaire: input.commentaire?.trim() || null,
    validatedAt: null,
    validatedByUserId: null,
    contratId: null,
    contratReference: null,
    documentChecklist,
    attachments: [],
    createdByUserId: input.actor._id,
    updatedByUserId: input.actor._id,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  const created = await db.collection<ResiliationStored>(COLLECTION).insertOne(doc as ResiliationStored);
  await appendAuditLog({
    entityType: "CONCESSIONNAIRE",
    entityId: input.concessionnaireId,
    action: "RESILIATION_CREATE",
    userId: input.actor._id,
    details: {
      resiliationId: created.insertedId.toHexString(),
      produitCode: doc.produitCode,
      statut: doc.statut,
    },
  });
  await notifyRoleTargets(
    "CHEF_SECTION",
    "Nouvelle demande de résiliation",
    `Opération résiliation | référence ${created.insertedId.toHexString()} | dossier reçu pour ${doc.produitCode} | acteur ${actionBy}.`,
    {
      resiliationId: created.insertedId.toHexString(),
      concessionnaireId: input.concessionnaireId,
      produitCode: doc.produitCode,
      statut: doc.statut,
    },
  );
  const row = await db.collection<ResiliationStored>(COLLECTION).findOne({ _id: created.insertedId });
  if (!row) throw new Error("RESILIATION_NOT_FOUND");
  return mapRow(row, documentChecklist);
}

export async function addResiliationAttachment(input: {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  storedRelativePath: string;
  actorId: string;
}) {
  if (!ObjectId.isValid(input.id)) throw new Error("RESILIATION_NOT_FOUND");
  const db = await getDatabase();
  const now = new Date();
  const attachment: ResiliationAttachment = {
    id: randomUUID(),
    filename: input.filename,
    mimeType: input.mimeType,
    size: input.size,
    storedRelativePath: input.storedRelativePath,
    uploadedAt: now,
    uploadedByUserId: input.actorId,
  };
  const r = await db.collection<ResiliationStored>(COLLECTION).updateOne(
    { _id: new ObjectId(input.id), deletedAt: null },
    { $push: { attachments: attachment }, $set: { updatedAt: now, updatedByUserId: input.actorId } },
  );
  if (r.matchedCount === 0) throw new Error("RESILIATION_NOT_FOUND");
}

export async function listResiliations(input: {
  page: number;
  pageSize: number;
  statut?: ResiliationStatus;
  concessionnaireId?: string;
  produitCode?: string;
  dateFrom?: Date;
  dateTo?: Date;
}) {
  const db = await getDatabase();
  const filter: Record<string, unknown> = { deletedAt: null };
  if (input.statut) filter.statut = input.statut;
  if (input.concessionnaireId) filter.concessionnaireId = input.concessionnaireId;
  if (input.produitCode) filter.produitCode = input.produitCode.trim().toUpperCase();
  if (input.dateFrom || input.dateTo) {
    const range: Record<string, Date> = {};
    if (input.dateFrom) range.$gte = input.dateFrom;
    if (input.dateTo) range.$lte = input.dateTo;
    filter.dateReception = range;
  }
  const skip = (input.page - 1) * input.pageSize;
  const [total, rows] = await Promise.all([
    db.collection<ResiliationStored>(COLLECTION).countDocuments(filter),
    db.collection<ResiliationStored>(COLLECTION).find(filter).sort({ dateReception: -1 }).skip(skip).limit(input.pageSize).toArray(),
  ]);
  return {
    items: rows.map((row) =>
      mapRow(row, parseResiliationDocumentChecklist(row.documentChecklist)),
    ),
    total,
    page: input.page,
    pageSize: input.pageSize,
  };
}

function ensureResiliationTransitionAllowed(role: string, from: ResiliationStatus, target: ResiliationStatus) {
  if (from === "DOSSIER_RECU" && target === "CONTROLE_CHEF_SECTION") {
    if (role !== "CHEF_SECTION") throw new Error("FORBIDDEN_TRANSITION");
    return;
  }
  if (from === "CONTROLE_CHEF_SECTION" && target === "VALIDATION_N2") {
    if (role !== "ASSIST_CDS") throw new Error("FORBIDDEN_TRANSITION");
    return;
  }
  if (from === "VALIDATION_N2" && target === "RESILIE") {
    if (role !== "CHEF_SERVICE") throw new Error("FORBIDDEN_TRANSITION");
    return;
  }
  if (target === "REJETEE") {
    if (!["CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"].includes(role)) throw new Error("FORBIDDEN_TRANSITION");
    return;
  }
  throw new Error("INVALID_TRANSITION");
}

async function finalizeResiliation(input: {
  row: ResiliationStored;
  resiliationId: string;
  commentaire?: string | null;
  actor: UserDocument;
}) {
  if (!input.actor._id) throw new Error("ACTOR_REQUIRED");
  const actionBy = userDisplayName(input.actor);
  const { row } = input;

  const checklist = await ensureRowDocumentChecklist(row);
  if (!isResiliationChecklistComplete(checklist)) {
    throw new Error("CHECKLIST_INCOMPLETE");
  }

  const archived = await markActiveContratAsResilieForProduct({
    concessionnaireId: row.concessionnaireId,
    produitCode: row.produitCode,
    actor: input.actor,
    resiliationId: input.resiliationId,
  });

  const db = await getDatabase();
  const now = new Date();
  await db.collection<ResiliationStored>(COLLECTION).updateOne(
    { _id: row._id },
    {
      $set: {
        statut: "RESILIE",
        commentaire: input.commentaire?.trim() || row.commentaire || null,
        validatedAt: now,
        validatedByUserId: input.actor._id,
        contratId: archived.contratId,
        contratReference: archived.contratReference,
        updatedAt: now,
        updatedByUserId: input.actor._id,
      },
    },
  );

  await updateConcessionnaire(row.concessionnaireId, { statut: "RESILIE" }, input.actor);

  await appendAuditLog({
    entityType: "CONCESSIONNAIRE",
    entityId: row.concessionnaireId,
    action: "RESILIATION_VALIDATED",
    userId: input.actor._id,
    details: {
      resiliationId: input.resiliationId,
      produitCode: row.produitCode,
      contratId: archived.contratId,
      contratReference: archived.contratReference,
      contratArchived: true,
    },
  });
  const reasonSuffix = input.commentaire?.trim() ? ` | motif ${input.commentaire.trim()}` : "";
  await notifyRoleTargets(
    "ASSIST_CDS",
    "Résiliation finalisée",
    `Opération résiliation | référence ${input.resiliationId} | ${row.produitCode} résilié | acteur ${actionBy}.${reasonSuffix}`,
    {
      resiliationId: input.resiliationId,
      concessionnaireId: row.concessionnaireId,
      produitCode: row.produitCode,
      statut: "RESILIE",
    },
  );
}

export async function transitionResiliation(input: {
  id: string;
  target: ResiliationStatus;
  confirmIrreversible?: true;
  commentaire?: string | null;
  actor: UserDocument;
}) {
  if (!input.actor._id) throw new Error("ACTOR_REQUIRED");
  const actionBy = userDisplayName(input.actor);
  if (!ObjectId.isValid(input.id)) throw new Error("RESILIATION_NOT_FOUND");

  const db = await getDatabase();
  const row = await db.collection<ResiliationStored>(COLLECTION).findOne({ _id: new ObjectId(input.id), deletedAt: null });
  if (!row) throw new Error("RESILIATION_NOT_FOUND");
  if (row.statut === "RESILIE" || row.statut === "REJETEE") {
    if (input.target === row.statut) return;
    throw new Error("INVALID_TRANSITION");
  }

  ensureResiliationTransitionAllowed(input.actor.role, row.statut, input.target);

  if (input.target === "CONTROLE_CHEF_SECTION") {
    const checklist = await ensureRowDocumentChecklist(row);
    if (!isResiliationChecklistComplete(checklist)) {
      throw new Error("CHECKLIST_INCOMPLETE");
    }
  }

  if (input.target === "RESILIE") {
    if (input.confirmIrreversible !== true) throw new Error("RESILIATION_CONFIRMATION_REQUIRED");
    if (row.statut !== "VALIDATION_N2") throw new Error("INVALID_TRANSITION");
    await finalizeResiliation({
      row,
      resiliationId: input.id,
      commentaire: input.commentaire,
      actor: input.actor,
    });
    return;
  }

  const now = new Date();
  const $set: Record<string, unknown> = {
    statut: input.target,
    commentaire: input.commentaire?.trim() || row.commentaire || null,
    updatedAt: now,
    updatedByUserId: input.actor._id,
  };

  if (input.target === "CONTROLE_CHEF_SECTION") {
    await notifyRoleTargets(
      "ASSIST_CDS",
      "Résiliation : validation N2 attendue",
      `Opération résiliation | référence ${input.id} | validation N2 attendue | acteur ${actionBy}.`,
      { resiliationId: input.id, produitCode: row.produitCode },
    );
  }
  if (input.target === "VALIDATION_N2") {
    await notifyRoleTargets(
      "CHEF_SERVICE",
      "Résiliation : validation finale attendue",
      `Opération résiliation | référence ${input.id} | validation Chef de Service attendue | acteur ${actionBy}.`,
      { resiliationId: input.id, produitCode: row.produitCode },
    );
  }

  await db.collection<ResiliationStored>(COLLECTION).updateOne({ _id: row._id }, { $set });
}

/** Finalise une résiliation (appelée via transition RESILIE depuis VALIDATION_N2). */
export async function validateResiliation(input: {
  id: string;
  confirmIrreversible: true;
  commentaire?: string | null;
  actor: UserDocument;
}) {
  return transitionResiliation({
    id: input.id,
    target: "RESILIE",
    confirmIrreversible: input.confirmIrreversible,
    commentaire: input.commentaire,
    actor: input.actor,
  });
}

export async function getResiliationById(id: string): Promise<ResiliationListItem | null> {
  if (!ObjectId.isValid(id)) return null;
  const db = await getDatabase();
  const row = await db.collection<ResiliationStored>(COLLECTION).findOne({ _id: new ObjectId(id), deletedAt: null });
  if (!row) return null;
  const documentChecklist = await ensureRowDocumentChecklist(row);
  return mapRow(row, documentChecklist);
}

export async function patchResiliationDocumentChecklist(input: {
  id: string;
  entries: Array<{ itemId: string; statut: DossierDocumentChecklistStatut }>;
  actorId: string;
}): Promise<ResiliationListItem> {
  if (!ObjectId.isValid(input.id)) throw new Error("RESILIATION_NOT_FOUND");
  const db = await getDatabase();
  const row = await db.collection<ResiliationStored>(COLLECTION).findOne({ _id: new ObjectId(input.id), deletedAt: null });
  if (!row) throw new Error("RESILIATION_NOT_FOUND");
  if (row.statut === "RESILIE" || row.statut === "REJETEE") throw new Error("RESILIATION_ALREADY_VALIDATED");

  const current = await ensureRowDocumentChecklist(row);

  const next = patchResiliationDocumentChecklistStatuts(current, input.entries);
  const now = new Date();
  await db.collection<ResiliationStored>(COLLECTION).updateOne(
    { _id: row._id },
    {
      $set: {
        documentChecklist: next,
        updatedAt: now,
        updatedByUserId: input.actorId,
      },
    },
  );
  const updated = await db.collection<ResiliationStored>(COLLECTION).findOne({ _id: row._id });
  if (!updated) throw new Error("RESILIATION_NOT_FOUND");
  return mapRow(updated, next);
}

export async function getResiliationAttachment(input: { id: string; attachmentId: string }) {
  if (!ObjectId.isValid(input.id)) return null;
  const db = await getDatabase();
  const row = await db.collection<ResiliationStored>(COLLECTION).findOne({ _id: new ObjectId(input.id), deletedAt: null });
  if (!row) return null;
  return row.attachments.find((a) => a.id === input.attachmentId) ?? null;
}

/** Pièce jointe + PDV pour contrôle d’accès sur la route de téléchargement. */
export async function getResiliationAttachmentWithConcessionnaire(input: { id: string; attachmentId: string }) {
  if (!ObjectId.isValid(input.id)) return null;
  const db = await getDatabase();
  const row = await db.collection<ResiliationStored>(COLLECTION).findOne({ _id: new ObjectId(input.id), deletedAt: null });
  if (!row) return null;
  const attachment = row.attachments.find((a) => a.id === input.attachmentId);
  if (!attachment) return null;
  return { attachment, concessionnaireId: row.concessionnaireId };
}

export function createResiliationAttachmentStream(storedRelativePath: string) {
  return createReadStream(path.join(FILE_ROOT, storedRelativePath));
}

