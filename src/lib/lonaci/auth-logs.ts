import { ObjectId } from "mongodb";

import type { AuthLogDocument } from "@/lib/lonaci/types";
import { getDatabase } from "@/lib/mongodb";

const AUTH_LOGS_COLLECTION = "auth_logs";

type StoredAuthLog = AuthLogDocument & { _id: ObjectId };

export interface AuthLogListItem {
  id: string;
  email: string;
  userId: string | null;
  status: "SUCCESS" | "FAILED";
  ipAddress: string | null;
  userAgent: string | null;
  attemptedAt: string;
  reason?: string;
}

export interface ListAuthLogsParams {
  page: number;
  pageSize: number;
  email?: string;
  status?: "SUCCESS" | "FAILED";
  from?: Date;
  to?: Date;
}

export interface ListAuthLogsResult {
  logs: AuthLogListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export async function ensureAuthLogsIndexes() {
  const db = await getDatabase();
  await db.collection<StoredAuthLog>(AUTH_LOGS_COLLECTION).createIndexes([
    { key: { attemptedAt: -1 }, name: "idx_attemptedAt_desc" },
    { key: { email: 1 }, name: "idx_email" },
    { key: { status: 1 }, name: "idx_status" },
  ]);
}

export async function logAuthAttempt(log: AuthLogDocument) {
  try {
    const db = await getDatabase();
    await db.collection<AuthLogDocument>(AUTH_LOGS_COLLECTION).insertOne(log);
  } catch (error) {
    console.error("[auth-logs] insert failed", error);
  }
}

export async function listAuthLogs(params: ListAuthLogsParams): Promise<ListAuthLogsResult> {
  const db = await getDatabase();
  const filter: Record<string, unknown> = {};

  if (params.email) {
    filter.email = params.email.trim().toLowerCase();
  }
  if (params.status) {
    filter.status = params.status;
  }
  if (params.from || params.to) {
    const range: Record<string, Date> = {};
    if (params.from) {
      range.$gte = params.from;
    }
    if (params.to) {
      range.$lte = params.to;
    }
    filter.attemptedAt = range;
  }

  const skip = (params.page - 1) * params.pageSize;
  const collection = db.collection<StoredAuthLog>(AUTH_LOGS_COLLECTION);

  const [total, rows] = await Promise.all([
    collection.countDocuments(filter),
    collection
      .find(filter)
      .sort({ attemptedAt: -1 })
      .skip(skip)
      .limit(params.pageSize)
      .toArray(),
  ]);

  const logs: AuthLogListItem[] = rows.map((row) => ({
    id: row._id.toHexString(),
    email: row.email,
    userId: row.userId,
    status: row.status,
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    attemptedAt: row.attemptedAt.toISOString(),
    reason: row.reason,
  }));

  return {
    logs,
    total,
    page: params.page,
    pageSize: params.pageSize,
  };
}
