import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { BANCARISATION_STATUTS, CONCESSIONNAIRE_STATUTS } from "@/lib/lonaci/constants";
import {
  concessionnaireListScopeAgenceId,
  ensureConcessionnaireIndexes,
  getConcessionnairesMapPoints,
} from "@/lib/lonaci/concessionnaires";
import { requireApiAuth } from "@/lib/auth/guards";

const querySchema = z.object({
  q: z.string().optional(),
  agenceId: z.string().optional(),
  statut: z.enum(CONCESSIONNAIRE_STATUTS).optional(),
  statutBancarisation: z.enum(BANCARISATION_STATUTS).optional(),
  produitCode: z.string().optional(),
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
  const parsed = querySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ message: "Parametres invalides", issues: parsed.error.issues }, { status: 400 });
  }

  const includeDeleted =
    parsed.data.includeDeleted === "true" && auth.user.role === "CHEF_SERVICE";

  await ensureConcessionnaireIndexes();
  const scope = concessionnaireListScopeAgenceId(auth.user);

  const payload = await getConcessionnairesMapPoints({
    q: parsed.data.q,
    agenceId: parsed.data.agenceId,
    scopeAgenceId: scope,
    includeDeleted,
    statut: parsed.data.statut,
    statutBancarisation: parsed.data.statutBancarisation,
    produitCode: parsed.data.produitCode,
  });

  return NextResponse.json(payload);
}
