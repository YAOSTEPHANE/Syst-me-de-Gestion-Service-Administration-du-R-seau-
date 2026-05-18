import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireApiAuth } from "@/lib/auth/guards";
import { listUnifiedAuditLogs } from "@/lib/lonaci/audit-logs";
import { ensureAuthLogsIndexes } from "@/lib/lonaci/auth-logs";
import { ensureMonitoringEventsIndexes } from "@/lib/observability/events";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  source: z.enum(["AUTH", "MONITORING"]).optional(),
  status: z.enum(["SUCCESS", "FAILED", "OPEN", "ACK"]).optional(),
  query: z.string().trim().min(1).max(200).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, { roles: ["CHEF_SERVICE"] });
  if ("error" in auth) return auth.error;

  const raw = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = querySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ message: "Parametres invalides", issues: parsed.error.issues }, { status: 400 });
  }

  await Promise.all([ensureAuthLogsIndexes(), ensureMonitoringEventsIndexes()]);

  const result = await listUnifiedAuditLogs({
    page: parsed.data.page,
    pageSize: parsed.data.pageSize,
    source: parsed.data.source,
    status: parsed.data.status,
    query: parsed.data.query,
    from: parsed.data.from ? new Date(parsed.data.from) : undefined,
    to: parsed.data.to ? new Date(parsed.data.to) : undefined,
  });

  return NextResponse.json(result, { status: 200 });
}
