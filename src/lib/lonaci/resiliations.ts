import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import path from "node:path";
import { ObjectId } from "mongodb";

import { appendAuditLog } from "@/lib/lonaci/audit";
import { findConcessionnaireById, updateConcessionnaire } from "@/lib/lonaci/concessionnaires";
import { notifyRoleTargets } from "@/lib/lonaci/notifications";
import type { UserDocument } from "@/lib/lonaci/types";
import { getDatabase } from "@/lib/mongodb";
import { prisma } from "@/lib/prisma";

const COLLECTION = "resiliations";
const FILE_ROOT = path.join(process.cwd(), "storage", "lonaci", "resiliations");

export type ResiliationStatus = "DOSSIER_RECU" | "RESILIE";

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
  attachments: Array<{ id: string; filename: string; mimeType: string; size: number; uploadedAt: string }>;
  createdAt: string;
  updatedAt: string;
}

function mapRow(row: ResiliationStored): ResiliationListItem {
  return {
    id: row._id.toHexString(),
    concessionnaireId: row.concessionnaireId,
    produitCode: row.produitCode,
    dateReception: row.dateReception.toISOString(),
    motif: row.motif,
    statut: row.statut,
    commentaire: row.commentaire,
    validatedAt: row.validatedAt ? row.validatedAt.toISOString() : null,
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
    "CHEF_SERVICE",
    "Nouvelle demande de résiliation",
    `Dossier de résiliation reçu pour ${doc.produitCode}.`,
    { resiliationId: created.insertedId.toHexString() },
  );
  const row = await db.collection<ResiliationStored>(COLLECTION).findOne({ _id: created.insertedId });
  if (!row) throw new Error("RESILIATION_NOT_FOUND");
  return mapRow(row);
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
  return { items: rows.map(mapRow), total, page: input.page, pageSize: input.pageSize };
}

export async function validateResiliation(input: {
  id: string;
  confirmIrreversible: true;
  commentaire?: string | null;
  actor: UserDocument;
}) {
  if (!input.actor._id) throw new Error("ACTOR_REQUIRED");
  if (!ObjectId.isValid(input.id)) throw new Error("RESILIATION_NOT_FOUND");
  if (input.confirmIrreversible !== true) throw new Error("RESILIATION_CONFIRMATION_REQUIRED");
  const db = await getDatabase();
  const row = await db.collection<ResiliationStored>(COLLECTION).findOne({ _id: new ObjectId(input.id), deletedAt: null });
  if (!row) throw new Error("RESILIATION_NOT_FOUND");
  if (row.statut === "RESILIE") return;

  const now = new Date();
  await db.collection<ResiliationStored>(COLLECTION).updateOne(
    { _id: row._id },
    {
      $set: {
        statut: "RESILIE",
        commentaire: input.commentaire?.trim() || row.commentaire || null,
        validatedAt: now,
        validatedByUserId: input.actor._id,
        updatedAt: now,
        updatedByUserId: input.actor._id,
      },
    },
  );

  await updateConcessionnaire(row.concessionnaireId, { statut: "RESILIE" }, input.actor);

  await prisma.contrat.updateMany({
    where: { concessionnaireId: row.concessionnaireId, status: "ACTIF", deletedAt: null },
    data: { status: "RESILIE", updatedByUserId: input.actor._id },
  });

  await appendAuditLog({
    entityType: "CONCESSIONNAIRE",
    entityId: row.concessionnaireId,
    action: "RESILIATION_VALIDATED",
    userId: input.actor._id,
    details: { resiliationId: input.id, produitCode: row.produitCode },
  });
}

export async function getResiliationAttachment(input: { id: string; attachmentId: string }) {
  if (!ObjectId.isValid(input.id)) return null;
  const db = await getDatabase();
  const row = await db.collection<ResiliationStored>(COLLECTION).findOne({ _id: new ObjectId(input.id), deletedAt: null });
  if (!row) return null;
  return row.attachments.find((a) => a.id === input.attachmentId) ?? null;
}

export function createResiliationAttachmentStream(storedRelativePath: string) {
  return createReadStream(path.join(FILE_ROOT, storedRelativePath));
}

