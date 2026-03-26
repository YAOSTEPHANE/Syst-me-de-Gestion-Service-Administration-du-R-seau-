import { ObjectId } from "mongodb";

import { getDatabase } from "@/lib/mongodb";

const COLLECTION = "agrements";
const COUNTERS_COLLECTION = "counters";
const REF_COUNTER_ID = "agrement_ref";

type AgrementStatus = "RECU" | "CONTROLE" | "TRANSMIS" | "FINALISE";

interface AgrementStored {
  _id: ObjectId;
  reference: string;
  produitCode: string;
  dateReception: Date;
  referenceOfficielle: string;
  agenceId: string | null;
  concessionnaireId: string | null;
  statut: AgrementStatus;
  observations: string | null;
  documentFilename: string;
  documentMimeType: string;
  documentSize: number;
  documentStoredRelativePath: string;
  createdByUserId: string;
  updatedByUserId: string;
  controlledByUserId: string | null;
  transmittedByUserId: string | null;
  finalizedByUserId: string | null;
  controlledAt: Date | null;
  transmittedAt: Date | null;
  finalizedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export async function ensureAgrementsIndexes() {
  const db = await getDatabase();
  await db.collection<AgrementStored>(COLLECTION).createIndexes([
    { key: { reference: 1 }, unique: true, name: "uniq_reference" },
    { key: { dateReception: -1, produitCode: 1 }, name: "idx_date_produit" },
    { key: { statut: 1, updatedAt: -1 }, name: "idx_status_updated" },
    { key: { agenceId: 1, statut: 1 }, name: "idx_agence_status" },
    { key: { concessionnaireId: 1, statut: 1 }, name: "idx_concessionnaire_status" },
  ]);
}

async function nextReference() {
  const db = await getDatabase();
  await db
    .collection<{ _id: string; seq: number }>(COUNTERS_COLLECTION)
    .updateOne({ _id: REF_COUNTER_ID }, { $inc: { seq: 1 } }, { upsert: true });
  const c = await db.collection<{ _id: string; seq: number }>(COUNTERS_COLLECTION).findOne({ _id: REF_COUNTER_ID });
  return `AGR-${String(c?.seq ?? 1).padStart(6, "0")}`;
}

export async function createAgrement(input: {
  produitCode: string;
  dateReception: Date;
  referenceOfficielle: string;
  agenceId: string | null;
  concessionnaireId: string | null;
  observations: string | null;
  documentFilename: string;
  documentMimeType: string;
  documentSize: number;
  actorId: string;
}) {
  const db = await getDatabase();
  const now = new Date();
  const reference = await nextReference();
  const doc: Omit<AgrementStored, "_id" | "documentStoredRelativePath"> = {
    reference,
    produitCode: input.produitCode.trim().toUpperCase(),
    dateReception: input.dateReception,
    referenceOfficielle: input.referenceOfficielle.trim(),
    agenceId: input.agenceId,
    concessionnaireId: input.concessionnaireId,
    statut: "RECU",
    observations: input.observations,
    documentFilename: input.documentFilename,
    documentMimeType: input.documentMimeType,
    documentSize: input.documentSize,
    createdByUserId: input.actorId,
    updatedByUserId: input.actorId,
    controlledByUserId: null,
    transmittedByUserId: null,
    finalizedByUserId: null,
    controlledAt: null,
    transmittedAt: null,
    finalizedAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  const result = await db.collection(COLLECTION).insertOne({ ...doc, documentStoredRelativePath: "" });
  return { id: result.insertedId.toHexString(), reference };
}

export async function attachAgrementDocument(input: {
  id: string;
  storedRelativePath: string;
  actorId: string;
}) {
  if (!ObjectId.isValid(input.id)) throw new Error("AGREMENT_NOT_FOUND");
  const db = await getDatabase();
  const now = new Date();
  const res = await db.collection(COLLECTION).updateOne(
    { _id: new ObjectId(input.id), deletedAt: null },
    {
      $set: {
        documentStoredRelativePath: input.storedRelativePath,
        updatedAt: now,
        updatedByUserId: input.actorId,
      },
    },
  );
  if (res.matchedCount === 0) throw new Error("AGREMENT_NOT_FOUND");
}

export async function transitionAgrement(input: {
  id: string;
  target: AgrementStatus;
  role: string;
  actorId: string;
}) {
  if (!ObjectId.isValid(input.id)) throw new Error("AGREMENT_NOT_FOUND");
  const db = await getDatabase();
  const row = await db.collection<AgrementStored>(COLLECTION).findOne({ _id: new ObjectId(input.id), deletedAt: null });
  if (!row) throw new Error("AGREMENT_NOT_FOUND");
  const now = new Date();
  const $set: Record<string, unknown> = { statut: input.target, updatedAt: now, updatedByUserId: input.actorId };

  if (row.statut === "RECU" && input.target === "CONTROLE") {
    if (!["CHEF_SECTION", "CHEF_SERVICE"].includes(input.role)) throw new Error("FORBIDDEN_TRANSITION");
    $set.controlledAt = now;
    $set.controlledByUserId = input.actorId;
  } else if (row.statut === "CONTROLE" && input.target === "TRANSMIS") {
    if (!["ASSIST_CDS", "CHEF_SERVICE"].includes(input.role)) throw new Error("FORBIDDEN_TRANSITION");
    $set.transmittedAt = now;
    $set.transmittedByUserId = input.actorId;
  } else if (row.statut === "TRANSMIS" && input.target === "FINALISE") {
    if (!["CHEF_SERVICE"].includes(input.role)) throw new Error("FORBIDDEN_TRANSITION");
    $set.finalizedAt = now;
    $set.finalizedByUserId = input.actorId;
  } else {
    throw new Error("INVALID_TRANSITION");
  }

  await db.collection(COLLECTION).updateOne({ _id: row._id }, { $set });
}

export async function listAgrements(input: {
  page: number;
  pageSize: number;
  agenceId?: string;
  produitCode?: string;
  statut?: AgrementStatus;
  dateFrom?: Date;
  dateTo?: Date;
}) {
  const db = await getDatabase();
  const filter: Record<string, unknown> = { deletedAt: null };
  if (input.agenceId) filter.agenceId = input.agenceId;
  if (input.produitCode) filter.produitCode = input.produitCode.toUpperCase();
  if (input.statut) filter.statut = input.statut;
  if (input.dateFrom || input.dateTo) {
    const r: Record<string, Date> = {};
    if (input.dateFrom) r.$gte = input.dateFrom;
    if (input.dateTo) r.$lte = input.dateTo;
    filter.dateReception = r;
  }
  const col = db.collection<AgrementStored>(COLLECTION);
  const skip = (input.page - 1) * input.pageSize;
  const [total, rows, byProduit] = await Promise.all([
    col.countDocuments(filter),
    col.find(filter).sort({ dateReception: -1 }).skip(skip).limit(input.pageSize).toArray(),
    col
      .aggregate<{ _id: string; count: number }>([
        { $match: { ...filter } },
        { $group: { _id: "$produitCode", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ])
      .toArray(),
  ]);

  return {
    items: rows.map((r) => ({
      id: r._id.toHexString(),
      reference: r.reference,
      produitCode: r.produitCode,
      dateReception: r.dateReception.toISOString(),
      referenceOfficielle: r.referenceOfficielle,
      agenceId: r.agenceId,
      concessionnaireId: r.concessionnaireId ?? null,
      statut: r.statut,
      observations: r.observations,
      documentFilename: r.documentFilename,
      documentMimeType: r.documentMimeType,
      documentSize: r.documentSize,
      hasDocument: Boolean(r.documentStoredRelativePath),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
    dashboard: { byProduit: byProduit.map((x) => ({ produitCode: x._id, count: x.count })) },
    total,
    page: input.page,
    pageSize: input.pageSize,
  };
}

export async function getAgrementDocumentMeta(id: string) {
  if (!ObjectId.isValid(id)) return null;
  const db = await getDatabase();
  const row = await db.collection<AgrementStored>(COLLECTION).findOne({ _id: new ObjectId(id), deletedAt: null });
  if (!row) return null;
  if (!row.documentStoredRelativePath) return null;
  return {
    filename: row.documentFilename,
    mimeType: row.documentMimeType,
    storedRelativePath: row.documentStoredRelativePath,
  };
}

