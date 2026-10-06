import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { zodBadRequest } from "@/lib/api/endpoint-helpers";
import { requireListAgenceScope, listAgenceScopeFields } from "@/lib/api/list-agence-scope";
import { SOUMISSION_STATUTS } from "@/lib/lonaci/soumission-constants";
import { ensureSoumissionsIndexes, getSoumissionStats } from "@/lib/lonaci/soumissions";
import { requireApiAuth } from "@/lib/auth/guards";

const statsSchema = z.object({
  agenceId: z.string().optional(),
  produitCode: z.string().optional(),
  statut: z.enum(SOUMISSION_STATUTS).optional(),
  appele: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  q: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, {
    roles: [
      "AGENT",
      "CHEF_SECTION",
      "ASSIST_CDS",
      "CHEF_SERVICE",
      "SUPERVISEUR_REGIONAL",
      "AUDITEUR",
      "LECTURE_SEULE",
    ],
  });
  if ("error" in auth) return auth.error;

  const parsed = statsSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
  if (!parsed.success) {
    return zodBadRequest(parsed.error, "Parametres invalides");
  }

  await ensureSoumissionsIndexes();
  const agenceScope = requireListAgenceScope(auth.user, parsed.data.agenceId);
  if (!agenceScope.ok) return agenceScope.response;

  const stats = await getSoumissionStats({
    ...listAgenceScopeFields(agenceScope),
    produitCode: parsed.data.produitCode?.trim() || undefined,
    statut: parsed.data.statut,
    appele: parsed.data.appele,
    q: parsed.data.q?.trim() || undefined,
  });

  return NextResponse.json(stats, { status: 200 });
}
