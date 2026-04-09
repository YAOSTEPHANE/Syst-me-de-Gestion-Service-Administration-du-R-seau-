import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireApiAuth } from "@/lib/auth/guards";
import { ensureMonitoringEventsIndexes, listMonitoringEvents } from "@/lib/observability/events";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  code: z.string().optional(),
  status: z.enum(["OPEN", "ACK"]).optional(),
});

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, { roles: ["CHEF_SERVICE"] });
  if ("error" in auth) return auth.error;

  const raw = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = querySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ message: "Parametres invalides", issues: parsed.error.issues }, { status: 400 });
  }

  await ensureMonitoringEventsIndexes();
  const result = await listMonitoringEvents({
    page: parsed.data.page,
    pageSize: parsed.data.pageSize,
    code: parsed.data.code,
    status: parsed.data.status,
  });
  return NextResponse.json(result, { status: 200 });
}

