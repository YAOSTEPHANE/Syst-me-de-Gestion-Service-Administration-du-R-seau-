import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireApiAuth } from "@/lib/auth/guards";
import { ensureMonitoringEventsIndexes, listMonitoringEvents } from "@/lib/observability/events";
import { createPdfResponse, renderMonitoringEventsPdf } from "@/lib/pdf";

const querySchema = z.object({
  code: z.string().optional(),
  status: z.enum(["OPEN", "ACK"]).optional(),
});

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, { roles: ["CHEF_SERVICE"] });
  if ("error" in auth) return auth.error;

  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json({ message: "Parametres invalides", issues: parsed.error.issues }, { status: 400 });
  }

  await ensureMonitoringEventsIndexes();
  const result = await listMonitoringEvents({
    page: 1,
    pageSize: 5000,
    code: parsed.data.code,
    status: parsed.data.status,
  });

  const generatedAt = new Date();
  const pdfBuffer = await renderMonitoringEventsPdf({
    generatedAt,
    filters: parsed.data,
    events: result.items,
    total: result.total,
    limit: 5000,
  });

  return createPdfResponse(pdfBuffer, {
    filename: `monitoring-events-${generatedAt.getTime()}`,
  });
}
