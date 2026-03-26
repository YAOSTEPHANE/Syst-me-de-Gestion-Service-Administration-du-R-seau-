import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  concessionnaireListScopeAgenceId,
  ensureConcessionnaireIndexes,
  getConcessionnairesPanelStats,
} from "@/lib/lonaci/concessionnaires";
import { requireApiAuth } from "@/lib/auth/guards";

const statsQuerySchema = z.object({
  q: z.string().optional(),
  agenceId: z.string().optional(),
  includeDeleted: z.enum(["true", "false"]).optional(),
});

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, {
    roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
  });
  if ("error" in auth) {
    return auth.error;
  }

  const raw = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = statsQuerySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ message: "Parametres invalides", issues: parsed.error.issues }, { status: 400 });
  }

  const includeDeleted =
    parsed.data.includeDeleted === "true" && auth.user.role === "CHEF_SERVICE";

  await ensureConcessionnaireIndexes();
  const scope = concessionnaireListScopeAgenceId(auth.user);

  const stats = await getConcessionnairesPanelStats({
    q: parsed.data.q,
    agenceId: parsed.data.agenceId,
    scopeAgenceId: scope,
    includeDeleted,
    statut: undefined,
    statutBancarisation: undefined,
    produitCode: undefined,
  });

  return NextResponse.json(stats);
}
