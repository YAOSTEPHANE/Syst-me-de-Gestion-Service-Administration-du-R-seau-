import { ObjectId } from "mongodb";

import { findVisibleDossierById } from "@/lib/lonaci/dossiers";
import type { UserDocument } from "@/lib/lonaci/types";
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

export async function listVisibleBulkTransitionLogs(
  params: {
    page: number;
    pageSize: number;
    actorUserId?: string;
    action?: string;
    failedOnly?: boolean;
  },
  actor: UserDocument,
) {
  const db = await getDatabase();
  const filter: Record<string, unknown> = {};
  if (params.actorUserId?.trim()) filter.actorUserId = params.actorUserId.trim();
  if (params.action?.trim()) filter.action = params.action.trim();
  if (params.failedOnly) filter.failed = { $gt: 0 };
  const rows = await db
    .collection<BulkTransitionLogDoc>(COLLECTION)
    .find(filter)
    .sort({ createdAt: -1 })
    .limit(5_000)
    .toArray();

  const visibleItems = (
    await Promise.all(
      rows.map(async (row): Promise<BulkTransitionLogItem | null> => {
        const visibility = await Promise.all(
          (row.resultSample ?? []).map(async (result) => ({
            result,
            visible: Boolean(await findVisibleDossierById(result.id, actor)),
          })),
        );
        const resultSample = visibility
          .filter((entry) => entry.visible)
          .map((entry) => entry.result);
        if (resultSample.length === 0) return null;
        const succeeded = resultSample.filter((result) => result.ok).length;
        return {
          id: row._id?.toHexString() ?? "",
          actorUserId: row.actorUserId,
          action: row.action,
          total: resultSample.length,
          succeeded,
          failed: resultSample.length - succeeded,
          comment: row.comment ?? null,
          resultSample,
          createdAt: row.createdAt.toISOString(),
        };
      }),
    )
  ).filter((item): item is BulkTransitionLogItem => item !== null);

  const skip = (params.page - 1) * params.pageSize;
  return {
    items: visibleItems.slice(skip, skip + params.pageSize),
    total: visibleItems.length,
    page: params.page,
    pageSize: params.pageSize,
  };
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
