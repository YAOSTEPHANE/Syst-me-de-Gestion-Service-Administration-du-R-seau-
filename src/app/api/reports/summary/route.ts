import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { zodBadRequest } from "@/lib/api/endpoint-helpers";
import { buildReportSummary, type ReportPeriod } from "@/lib/lonaci/reports";
import { requireApiAuth } from "@/lib/auth/guards";

const schema = z.object({
  period: z.enum(["daily", "weekly", "monthly"]).default("daily"),
  agenceId: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, {
    roles: ["CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
  });
  if ("error" in auth) return auth.error;

  const parsed = schema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
  if (!parsed.success) {
    return zodBadRequest(parsed.error, "Parametres invalides");
  }

  const summary = await buildReportSummary(parsed.data.period as ReportPeriod, parsed.data.agenceId);
  return NextResponse.json(summary, { status: 200 });
}
