import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { zodBadRequest } from "@/lib/api/endpoint-helpers";
import { requireApiAuth } from "@/lib/auth/guards";
import {
  bulkTransitionLogsToCsv,
  ensureBulkTransitionLogsIndexes,
  listBulkTransitionLogs,
} from "@/lib/lonaci/dossier-bulk-transition-logs";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(10),
  actorUserId: z.string().trim().optional(),
  action: z.string().trim().optional(),
  failedOnly: z.enum(["0", "1"]).optional().default("0"),
  format: z.enum(["json", "csv"]).optional().default("json"),
});

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, {
    roles: ["CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
    rbac: { resource: "DOSSIERS", action: "READ" },
  });
  if ("error" in auth) return auth.error;

  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
  if (!parsed.success) {
    return zodBadRequest(parsed.error, "Paramètres invalides");
  }

  await ensureBulkTransitionLogsIndexes();
  const data = await listBulkTransitionLogs({
    page: parsed.data.page,
    pageSize: parsed.data.pageSize,
    actorUserId: parsed.data.actorUserId,
    action: parsed.data.action,
    failedOnly: parsed.data.failedOnly === "1",
  });
  if (parsed.data.format === "csv") {
    const csv = bulkTransitionLogsToCsv(data.items);
    const filename = `dossier-bulk-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }
  return NextResponse.json(data, { status: 200 });
}
