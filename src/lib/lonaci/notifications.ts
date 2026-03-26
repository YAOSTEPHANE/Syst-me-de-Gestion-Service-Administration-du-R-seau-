import { ObjectId } from "mongodb";

import type { LonaciRole, NotificationDocument } from "@/lib/lonaci/types";
import { getDatabase } from "@/lib/mongodb";
import { listActiveUsersByRole } from "@/lib/lonaci/users";

const COLLECTION = "notifications";

type StoredNotification = Omit<NotificationDocument, "_id"> & { _id: ObjectId };
type InsertNotification = Omit<StoredNotification, "_id">;

function mapNotification(row: StoredNotification) {
  return {
    id: row._id.toHexString(),
    userId: row.userId,
    roleTarget: row.roleTarget,
    title: row.title,
    message: row.message,
    channel: row.channel,
    readAt: row.readAt ? row.readAt.toISOString() : null,
    metadata: row.metadata,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function ensureNotificationIndexes() {
  const db = await getDatabase();
  await db.collection<StoredNotification>(COLLECTION).createIndexes([
    { key: { userId: 1, createdAt: -1 }, name: "idx_user_created" },
    { key: { roleTarget: 1, createdAt: -1 }, name: "idx_role_created" },
    { key: { readAt: 1 }, name: "idx_readAt" },
  ]);
}

export interface SendNotificationInput {
  userId?: string | null;
  roleTarget?: LonaciRole | null;
  title: string;
  message: string;
  channel?: "IN_APP" | "EMAIL";
  metadata?: Record<string, unknown> | null;
}

export async function sendNotification(input: SendNotificationInput) {
  const db = await getDatabase();
  const doc: InsertNotification = {
    userId: input.userId ?? null,
    roleTarget: input.roleTarget ?? null,
    title: input.title,
    message: input.message,
    channel: input.channel ?? "IN_APP",
    readAt: null,
    metadata: input.metadata ?? null,
    createdAt: new Date(),
  };
  await db.collection<InsertNotification>(COLLECTION).insertOne(doc);
}

export async function notifyRoleTargets(
  role: LonaciRole,
  title: string,
  message: string,
  metadata?: Record<string, unknown>,
) {
  const users = await listActiveUsersByRole(role);
  await Promise.all(
    users.map((user) =>
      sendNotification({
        userId: user._id ?? null,
        roleTarget: role,
        title,
        message,
        metadata,
      }),
    ),
  );
}

export async function listMyNotifications(userId: string, page: number, pageSize: number) {
  const db = await getDatabase();
  const skip = (page - 1) * pageSize;
  const col = db.collection<StoredNotification>(COLLECTION);
  const filter = { userId };
  const [total, rows] = await Promise.all([
    col.countDocuments(filter),
    col.find(filter).sort({ createdAt: -1 }).skip(skip).limit(pageSize).toArray(),
  ]);
  return {
    items: rows.map(mapNotification),
    total,
    page,
    pageSize,
  };
}

export async function markNotificationRead(notificationId: string, userId: string): Promise<boolean> {
  if (!ObjectId.isValid(notificationId)) {
    return false;
  }
  const db = await getDatabase();
  const result = await db.collection<StoredNotification>(COLLECTION).updateOne(
    { _id: new ObjectId(notificationId), userId },
    { $set: { readAt: new Date() } },
  );
  return result.matchedCount > 0;
}
