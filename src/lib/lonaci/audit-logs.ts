import { getDatabase } from "@/lib/mongodb";

type AuditSource = "AUTH" | "MONITORING";
type AuditStatus = "SUCCESS" | "FAILED" | "OPEN" | "ACK";

export interface UnifiedAuditLogItem {
  id: string;
  source: AuditSource;
  timestamp: string;
  status: AuditStatus;
  code: string | null;
  title: string;
  message: string;
  actor: string | null;
  targetRole: string | null;
}

export interface ListUnifiedAuditLogsParams {
  page: number;
  pageSize: number;
  source?: AuditSource;
  status?: AuditStatus;
  query?: string;
  from?: Date;
  to?: Date;
}

export interface ListUnifiedAuditLogsResult {
  items: UnifiedAuditLogItem[];
  total: number;
  page: number;
  pageSize: number;
}

const AUTH_LOGS_COLLECTION = "auth_logs";
const MONITORING_EVENTS_COLLECTION = "monitoring_events";

function buildAuthMatch(params: ListUnifiedAuditLogsParams): Record<string, unknown> {
  const match: Record<string, unknown> = {};

  if (params.status && (params.status === "SUCCESS" || params.status === "FAILED")) {
    match.status = params.status;
  }

  if (params.from || params.to) {
    const range: Record<string, Date> = {};
    if (params.from) range.$gte = params.from;
    if (params.to) range.$lte = params.to;
    match.attemptedAt = range;
  }

  if (params.query?.trim()) {
    const regex = new RegExp(params.query.trim(), "i");
    match.$or = [{ email: regex }, { reason: regex }, { ipAddress: regex }, { userAgent: regex }];
  }

  return match;
}

function buildMonitoringMatch(params: ListUnifiedAuditLogsParams): Record<string, unknown> {
  const match: Record<string, unknown> = {};

  if (params.status && (params.status === "OPEN" || params.status === "ACK")) {
    match.status = params.status;
  }

  if (params.from || params.to) {
    const range: Record<string, Date> = {};
    if (params.from) range.$gte = params.from;
    if (params.to) range.$lte = params.to;
    match.createdAt = range;
  }

  if (params.query?.trim()) {
    const regex = new RegExp(params.query.trim(), "i");
    match.$or = [{ code: regex }, { title: regex }, { message: regex }];
  }

  return match;
}

export async function listUnifiedAuditLogs(
  params: ListUnifiedAuditLogsParams,
): Promise<ListUnifiedAuditLogsResult> {
  if (params.status && params.source === "AUTH" && (params.status === "OPEN" || params.status === "ACK")) {
    return { items: [], total: 0, page: params.page, pageSize: params.pageSize };
  }
  if (
    params.status &&
    params.source === "MONITORING" &&
    (params.status === "SUCCESS" || params.status === "FAILED")
  ) {
    return { items: [], total: 0, page: params.page, pageSize: params.pageSize };
  }

  const db = await getDatabase();
  const skip = (params.page - 1) * params.pageSize;
  const authMatch = buildAuthMatch(params);
  const monitoringMatch = buildMonitoringMatch(params);

  const authProjectionPipeline: Record<string, unknown>[] = [
    ...(Object.keys(authMatch).length ? [{ $match: authMatch }] : []),
    {
      $project: {
        _id: 0,
        id: { $toString: "$_id" },
        source: { $literal: "AUTH" },
        timestamp: "$attemptedAt",
        status: "$status",
        code: { $literal: null },
        title: {
          $cond: [{ $eq: ["$status", "SUCCESS"] }, "Connexion reussie", "Echec de connexion"],
        },
        message: { $ifNull: ["$reason", "Tentative d'authentification"] },
        actor: "$email",
        targetRole: { $literal: null },
      },
    },
  ];

  const monitoringProjectionPipeline: Record<string, unknown>[] = [
    ...(Object.keys(monitoringMatch).length ? [{ $match: monitoringMatch }] : []),
    {
      $project: {
        _id: 0,
        id: { $toString: "$_id" },
        source: { $literal: "MONITORING" },
        timestamp: "$createdAt",
        status: "$status",
        code: "$code",
        title: "$title",
        message: "$message",
        actor: "$ackedByUserId",
        targetRole: "$roleTarget",
      },
    },
  ];

  let pipeline: Record<string, unknown>[] = [];

  if (params.source === "AUTH") {
    pipeline = authProjectionPipeline;
  } else if (params.source === "MONITORING") {
    pipeline = monitoringProjectionPipeline;
  } else {
    pipeline = [
      ...authProjectionPipeline,
      {
        $unionWith: {
          coll: MONITORING_EVENTS_COLLECTION,
          pipeline: monitoringProjectionPipeline,
        },
      },
    ];
  }

  const result = await db
    .collection(AUTH_LOGS_COLLECTION)
    .aggregate<{
      items: UnifiedAuditLogItem[];
      totalCount: Array<{ value: number }>;
    }>([
      ...pipeline,
      { $sort: { timestamp: -1 } },
      {
        $facet: {
          items: [{ $skip: skip }, { $limit: params.pageSize }],
          totalCount: [{ $count: "value" }],
        },
      },
    ])
    .toArray();

  const first = result[0];
  const items = (first?.items ?? []).map((item) => ({
    ...item,
    timestamp: new Date(item.timestamp).toISOString(),
  }));
  const total = first?.totalCount?.[0]?.value ?? 0;

  return { items, total, page: params.page, pageSize: params.pageSize };
}
