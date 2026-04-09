import { ObjectId } from "mongodb";

import type { LonaciRole } from "@/lib/lonaci/constants";
import { getDatabase } from "@/lib/mongodb";

const MONITORING_EVENTS_COLLECTION = "monitoring_events";

type MonitoringEventDoc = {
  _id?: ObjectId;
  code: string;
  title: string;
  message: string;
  level: "CRITICAL";
  status: "OPEN" | "ACK";
  ackedAt: Date | null;
  ackedByUserId: string | null;
  roleTarget: LonaciRole;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
};

export interface MonitoringEventListItem {
  id: string;
  code: string;
  title: string;
  message: string;
  level: "CRITICAL";
  status: "OPEN" | "ACK";
  ackedAt: string | null;
  ackedByUserId: string | null;
  roleTarget: LonaciRole;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export async function ensureMonitoringEventsIndexes() {
  const db = await getDatabase();
  await db.collection<MonitoringEventDoc>(MONITORING_EVENTS_COLLECTION).createIndexes([
    { key: { createdAt: -1 }, name: "idx_created_at_desc" },
    { key: { code: 1 }, name: "idx_code" },
    { key: { level: 1, createdAt: -1 }, name: "idx_level_created_at" },
    { key: { status: 1, createdAt: -1 }, name: "idx_status_created_at" },
  ]);
}

export async function appendMonitoringEvent(input: {
  code: string;
  title: string;
  message: string;
  roleTarget: LonaciRole;
  metadata?: Record<string, unknown>;
}) {
  const db = await getDatabase();
  await db.collection<MonitoringEventDoc>(MONITORING_EVENTS_COLLECTION).insertOne({
    code: input.code,
    title: input.title,
    message: input.message,
    level: "CRITICAL",
    status: "OPEN",
    ackedAt: null,
    ackedByUserId: null,
    roleTarget: input.roleTarget,
    metadata: input.metadata ?? null,
    createdAt: new Date(),
  });
}

export async function listMonitoringEvents(params: {
  page: number;
  pageSize: number;
  code?: string;
  status?: "OPEN" | "ACK";
}): Promise<{ items: MonitoringEventListItem[]; total: number; page: number; pageSize: number }> {
  const db = await getDatabase();
  const filter: Record<string, unknown> = {};
  if (params.code?.trim()) {
    filter.code = params.code.trim();
  }
  if (params.status) {
    filter.status = params.status;
  }
  const skip = (params.page - 1) * params.pageSize;
  const col = db.collection<MonitoringEventDoc>(MONITORING_EVENTS_COLLECTION);
  const [total, rows] = await Promise.all([
    col.countDocuments(filter),
    col.find(filter).sort({ createdAt: -1 }).skip(skip).limit(params.pageSize).toArray(),
  ]);
  return {
    items: rows.map((r) => ({
      id: r._id.toHexString(),
      code: r.code,
      title: r.title,
      message: r.message,
      level: r.level,
      status: r.status,
      ackedAt: r.ackedAt ? r.ackedAt.toISOString() : null,
      ackedByUserId: r.ackedByUserId ?? null,
      roleTarget: r.roleTarget,
      metadata: r.metadata ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
    total,
    page: params.page,
    pageSize: params.pageSize,
  };
}

export async function ackMonitoringEvent(input: { id: string; actorUserId: string }): Promise<boolean> {
  if (!ObjectId.isValid(input.id)) return false;
  const db = await getDatabase();
  const result = await db.collection<MonitoringEventDoc>(MONITORING_EVENTS_COLLECTION).updateOne(
    { _id: new ObjectId(input.id), status: { $ne: "ACK" } },
    {
      $set: {
        status: "ACK",
        ackedAt: new Date(),
        ackedByUserId: input.actorUserId,
      },
    },
  );
  return result.matchedCount > 0;
}

