import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { zodBadRequest } from "@/lib/api/endpoint-helpers";
import { requireListAgenceScope } from "@/lib/api/list-agence-scope";
import { buildReportSummary, type ReportPeriod } from "@/lib/lonaci/reports";
import { requireApiAuth } from "@/lib/auth/guards";

const schema = z.object({
  period: z.enum(["daily", "weekly", "monthly"]).default("daily"),
  agenceId: z.string().optional(),
  compareAgences: z.enum(["0", "1"]).optional().default("0"),
  topAgences: z.coerce.number().int().min(1).max(50).optional().default(8),
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

  const agenceScope = requireListAgenceScope(auth.user, parsed.data.agenceId);
  if (!agenceScope.ok) return agenceScope.response;

  const summary = await buildReportSummary(
    parsed.data.period as ReportPeriod,
    agenceScope.agenceId,
    parsed.data.compareAgences === "1" ? parsed.data.topAgences : 0,
    agenceScope.agenceIds,
  );
  return NextResponse.json(summary, { status: 200 });
}
