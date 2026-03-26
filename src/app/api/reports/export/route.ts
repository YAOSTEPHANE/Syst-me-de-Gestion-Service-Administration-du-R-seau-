import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { buildReportSummary, summaryToCsv, type ReportPeriod } from "@/lib/lonaci/reports";
import { requireApiAuth } from "@/lib/auth/guards";

const schema = z.object({
  period: z.enum(["daily", "weekly", "monthly"]).default("daily"),
  format: z.enum(["csv", "json"]).default("csv"),
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
  if (parsed.data.format === "json") {
    return NextResponse.json(summary, { status: 200 });
  }

  const csv = summaryToCsv(summary);
  const filename = `lonaci-rapport-${parsed.data.period}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
