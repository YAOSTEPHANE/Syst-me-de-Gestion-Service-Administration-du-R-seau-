import { ObjectId } from "mongodb";

import { getDatabase } from "@/lib/mongodb";
import { escapeRegexLiteral } from "@/lib/security/escape-regex";

const MAX_SEARCH_Q_LENGTH = 200;

export const REGISTRY_MODULES = ["AGREMENT", "CESSION", "GPR"] as const;
export type RegistryModule = (typeof REGISTRY_MODULES)[number];

const COLLECTION = "lonaci_registries";

export interface LonaciRegistryDocument {
  _id?: string;
  module: RegistryModule;
  reference: string;
  titre: string;
  concessionnaireId: string | null;
  agenceId: string | null;
  statut: string;
  commentaire: string | null;
  meta: Record<string, unknown>;
  createdByUserId: string;
  updatedByUserId: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

type Stored = Omit<LonaciRegistryDocument, "_id" | "meta"> & {
  _id: ObjectId;
  meta: unknown;
};

function mapDoc(row: Stored): LonaciRegistryDocument {
  return {
    _id: row._id.toHexString(),
    module: row.module,
    reference: row.reference,
    titre: row.titre,
    concessionnaireId: row.concessionnaireId,
    agenceId: row.agenceId,
    statut: row.statut,
    commentaire: row.commentaire,
    meta: (row.meta && typeof row.meta === "object" ? row.meta : {}) as Record<string, unknown>,
    createdByUserId: row.createdByUserId,
    updatedByUserId: row.updatedByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

export async function ensureRegistryIndexes() {
  const db = await getDatabase();
  await db.collection(COLLECTION).createIndexes([
    { key: { module: 1, reference: 1 }, unique: true, name: "uniq_module_ref" },
    { key: { module: 1, updatedAt: -1 }, name: "idx_module_updated" },
    { key: { deletedAt: 1 }, name: "idx_deleted" },
  ]);
}

async function nextRef(module: RegistryModule): Promise<string> {
  const db = await getDatabase();
  const key = `registry_ref_${module}`;
  const counterColl = db.collection<{ _id: string; seq: number }>("counters");
  await counterColl.updateOne({ _id: key }, { $inc: { seq: 1 } }, { upsert: true });
  const c = await counterColl.findOne({ _id: key });
  const seq = c?.seq ?? 1;
  const prefix = module === "AGREMENT" ? "AGR" : module === "CESSION" ? "CES" : "GPR";
  return `${prefix}-${String(seq).padStart(6, "0")}`;
}

export async function listRegistries(
  module: RegistryModule,
  page: number,
  pageSize: number,
  filters?: { q?: string; statut?: string; agenceId?: string },
) {
  const db = await getDatabase();
  const qRaw = filters?.q?.trim();
  const q = qRaw && qRaw.length > MAX_SEARCH_Q_LENGTH ? qRaw.slice(0, MAX_SEARCH_Q_LENGTH) : qRaw;
  const statut = filters?.statut?.trim();
  const agenceId = filters?.agenceId?.trim();
  const filter: Record<string, unknown> = { module, deletedAt: null };
  if (statut) filter.statut = statut;
  if (agenceId) filter.agenceId = agenceId;
  if (q) {
    const safe = escapeRegexLiteral(q);
    filter.$or = [
      { reference: { $regex: safe, $options: "i" } },
      { titre: { $regex: safe, $options: "i" } },
      { commentaire: { $regex: safe, $options: "i" } },
    ];
  }
  const skip = (page - 1) * pageSize;
  const [totalPrimary, rows] = await Promise.all([
    db.collection<Stored>(COLLECTION).countDocuments(filter),
    db
      .collection<Stored>(COLLECTION)
      .find(filter)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(pageSize)
      .toArray(),
  ]);
  return { total: totalPrimary, items: rows.map(mapDoc) };
}

export async function createRegistry(input: {
  module: RegistryModule;
  titre: string;
  concessionnaireId: string | null;
  agenceId: string | null;
  statut: string;
  commentaire: string | null;
  meta?: Record<string, unknown>;
  actorId: string;
}): Promise<LonaciRegistryDocument> {
  const reference = await nextRef(input.module);
  const db = await getDatabase();
  const now = new Date();
  const doc = {
    module: input.module,
    reference,
    titre: input.titre.trim(),
    concessionnaireId: input.concessionnaireId,
    agenceId: input.agenceId,
    statut: input.statut,
    commentaire: input.commentaire?.trim() ?? null,
    meta: input.meta ?? {},
    createdByUserId: input.actorId,
    updatedByUserId: input.actorId,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  const r = await db.collection(COLLECTION).insertOne(doc);
  return mapDoc({ ...doc, _id: r.insertedId } as Stored);
}

export async function updateRegistry(
  id: string,
  input: { statut?: string; commentaire?: string | null; titre?: string; actorId: string },
): Promise<LonaciRegistryDocument | null> {
  if (!ObjectId.isValid(id)) return null;
  const db = await getDatabase();
  const now = new Date();
  const $set: Record<string, unknown> = { updatedAt: now, updatedByUserId: input.actorId };
  if (input.statut !== undefined) $set.statut = input.statut;
  if (input.commentaire !== undefined) $set.commentaire = input.commentaire;
  if (input.titre !== undefined) $set.titre = input.titre.trim();
  const up = await db.collection(COLLECTION).updateOne(
    { _id: new ObjectId(id), deletedAt: null },
    { $set },
  );
  if (up.matchedCount > 0) {
    const row = await db.collection<Stored>(COLLECTION).findOne({ _id: new ObjectId(id) });
    return row ? mapDoc(row) : null;
  }
  return null;
}

export async function softDeleteRegistry(id: string, actorId: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;
  const db = await getDatabase();
  const now = new Date();
  const up = await db.collection(COLLECTION).updateOne(
    { _id: new ObjectId(id), deletedAt: null },
    { $set: { deletedAt: now, updatedAt: now, updatedByUserId: actorId } },
  );
  return up.matchedCount > 0;
}
