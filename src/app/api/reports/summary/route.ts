import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { buildReportSummary, type ReportPeriod } from "@/lib/lonaci/reports";
import { requireApiAuth } from "@/lib/auth/guards";

const schema = z.object({
  period: z.enum(["daily", "weekly", "monthly"]).default("daily"),
});

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, {
    roles: ["CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
  });
  if ("error" in auth) return auth.error;

  const parsed = schema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json({ message: "Parametres invalides", issues: parsed.error.issues }, { status: 400 });
  }

  const summary = await buildReportSummary(parsed.data.period as ReportPeriod);
  return NextResponse.json(summary, { status: 200 });
}
