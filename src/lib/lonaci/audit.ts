import { ObjectId } from "mongodb";

import { getDatabase } from "@/lib/mongodb";
import type { AuditLogDocument } from "@/lib/lonaci/types";

const AUDIT_LOGS_COLLECTION = "audit_logs";

type StoredAudit = AuditLogDocument & { _id: ObjectId };

export async function ensureAuditIndexes() {
  const db = await getDatabase();
  await db.collection<StoredAudit>(AUDIT_LOGS_COLLECTION).createIndexes([
    { key: { entityId: 1, createdAt: -1 }, name: "idx_entity_created" },
    { key: { entityType: 1, createdAt: -1 }, name: "idx_type_created" },
  ]);
}

export async function appendAuditLog(entry: Omit<AuditLogDocument, "createdAt">) {
  const db = await getDatabase();
  const doc: AuditLogDocument = {
    ...entry,
    details: entry.details ?? null,
    createdAt: new Date(),
  };
  await db.collection<AuditLogDocument>(AUDIT_LOGS_COLLECTION).insertOne(doc);
}

export interface ListAuditParams {
  entityType: AuditLogDocument["entityType"];
  entityId: string;
  page: number;
  pageSize: number;
}

export interface AuditListItem {
  id: string;
  entityType: AuditLogDocument["entityType"];
  entityId: string;
  action: string;
  userId: string;
  details: Record<string, unknown> | null;
  createdAt: string;
}

export async function listAuditLogs(params: ListAuditParams): Promise<{
  items: AuditListItem[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const db = await getDatabase();
  const filter = { entityType: params.entityType, entityId: params.entityId };
  const skip = (params.page - 1) * params.pageSize;
  const col = db.collection<StoredAudit>(AUDIT_LOGS_COLLECTION);

  const [total, rows] = await Promise.all([
    col.countDocuments(filter),
    col.find(filter).sort({ createdAt: -1 }).skip(skip).limit(params.pageSize).toArray(),
  ]);

  const items: AuditListItem[] = rows.map((row) => ({
    id: row._id.toHexString(),
    entityType: row.entityType,
    entityId: row.entityId,
    action: row.action,
    userId: row.userId,
    details: row.details,
    createdAt: row.createdAt.toISOString(),
  }));

  return { items, total, page: params.page, pageSize: params.pageSize };
}
