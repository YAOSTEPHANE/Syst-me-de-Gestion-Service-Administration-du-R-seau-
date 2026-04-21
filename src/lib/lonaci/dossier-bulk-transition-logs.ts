import { ObjectId } from "mongodb";

import { getDatabase } from "@/lib/mongodb";

const COLLECTION = "dossier_bulk_transition_logs";

type BulkTransitionLogDoc = {
  _id?: ObjectId;
  actorUserId: string;
  action: string;
  total: number;
  succeeded: number;
  failed: number;
  comment: string | null;
  resultSample: Array<{ id: string; ok: boolean; message: string }>;
  createdAt: Date;
};

export interface BulkTransitionLogItem {
  id: string;
  actorUserId: string;
  action: string;
  total: number;
  succeeded: number;
  failed: number;
  comment: string | null;
  resultSample: Array<{ id: string; ok: boolean; message: string }>;
  createdAt: string;
}

export async function ensureBulkTransitionLogsIndexes() {
  const db = await getDatabase();
  await db.collection<BulkTransitionLogDoc>(COLLECTION).createIndexes([
    { key: { createdAt: -1 }, name: "idx_created_at_desc" },
    { key: { actorUserId: 1, createdAt: -1 }, name: "idx_actor_created" },
  ]);
}

export async function appendBulkTransitionLog(input: {
  actorUserId: string;
  action: string;
  total: number;
  succeeded: number;
  failed: number;
  comment?: string | null;
  resultSample: Array<{ id: string; ok: boolean; message: string }>;
}) {
  const db = await getDatabase();
  await db.collection<BulkTransitionLogDoc>(COLLECTION).insertOne({
    actorUserId: input.actorUserId,
    action: input.action,
    total: input.total,
    succeeded: input.succeeded,
    failed: input.failed,
    comment: input.comment ?? null,
    resultSample: input.resultSample.slice(0, 20),
    createdAt: new Date(),
  });
}

export async function listBulkTransitionLogs(params: {
  page: number;
  pageSize: number;
  actorUserId?: string;
  action?: string;
  failedOnly?: boolean;
}) {
  const db = await getDatabase();
  const filter: Record<string, unknown> = {};
  if (params.actorUserId?.trim()) {
    filter.actorUserId = params.actorUserId.trim();
  }
  if (params.action?.trim()) {
    filter.action = params.action.trim();
  }
  if (params.failedOnly) {
    filter.failed = { $gt: 0 };
  }
  const skip = (params.page - 1) * params.pageSize;
  const col = db.collection<BulkTransitionLogDoc>(COLLECTION);
  const [total, rows] = await Promise.all([
    col.countDocuments(filter),
    col.find(filter).sort({ createdAt: -1 }).skip(skip).limit(params.pageSize).toArray(),
  ]);

  const items: BulkTransitionLogItem[] = rows.map((row) => ({
    id: row._id?.toHexString() ?? "",
    actorUserId: row.actorUserId,
    action: row.action,
    total: row.total,
    succeeded: row.succeeded,
    failed: row.failed,
    comment: row.comment ?? null,
    resultSample: row.resultSample ?? [],
    createdAt: row.createdAt.toISOString(),
  }));

  return { items, total, page: params.page, pageSize: params.pageSize };
}

export async function findBulkTransitionLogById(id: string): Promise<BulkTransitionLogItem | null> {
  if (!ObjectId.isValid(id)) return null;
  const db = await getDatabase();
  const row = await db.collection<BulkTransitionLogDoc>(COLLECTION).findOne({ _id: new ObjectId(id) });
  if (!row) return null;
  return {
    id: row._id?.toHexString() ?? "",
    actorUserId: row.actorUserId,
    action: row.action,
    total: row.total,
    succeeded: row.succeeded,
    failed: row.failed,
    comment: row.comment ?? null,
    resultSample: row.resultSample ?? [],
    createdAt: row.createdAt.toISOString(),
  };
}

export function bulkTransitionLogsToCsv(items: BulkTransitionLogItem[]): string {
  const lines = [
    "id,createdAt,actorUserId,action,total,succeeded,failed,comment",
    ...items.map((it) =>
      [
        it.id,
        it.createdAt,
        it.actorUserId,
        it.action,
        String(it.total),
        String(it.succeeded),
        String(it.failed),
        (it.comment ?? "").replace(/"/g, '""'),
      ]
        .map((cell) => `"${cell}"`)
        .join(","),
    ),
  ];
  return lines.join("\n");
}
