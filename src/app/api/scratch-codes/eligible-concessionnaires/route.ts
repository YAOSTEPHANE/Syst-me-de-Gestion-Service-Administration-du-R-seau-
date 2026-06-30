import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { zodBadRequest } from "@/lib/api/endpoint-helpers";
import { requireListAgenceScope, listAgenceScopeFields } from "@/lib/api/list-agence-scope";
import { requireApiAuth } from "@/lib/auth/guards";
import { ensureGprGrattageIndexes, listEligibleConcessionnairesForProduct } from "@/lib/lonaci/gpr-grattage";
import { GRATTAGE_API_ROLES } from "@/lib/lonaci/grattage-access";

const querySchema = z.object({
  produitCode: z.string().min(1),
  agenceId: z.string().optional(),
  q: z.string().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

/** §9.2 — Concessionnaires éligibles (contrat actif + GPR validé) pour un produit. */
export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, { roles: [...GRATTAGE_API_ROLES] });
  if ("error" in auth) return auth.error;
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
  if (!parsed.success) {
    return zodBadRequest(parsed.error, "Parametres invalides");
  }
  await ensureGprGrattageIndexes();
  const agenceScope = requireListAgenceScope(auth.user, parsed.data.agenceId);
  if (!agenceScope.ok) return agenceScope.response;
  const scopeFields = listAgenceScopeFields(agenceScope);
  const items = await listEligibleConcessionnairesForProduct({
    produitCode: parsed.data.produitCode,
    agenceId: scopeFields.agenceId ?? scopeFields.scopeAgenceId,
    agenceIds: scopeFields.agenceIds ?? scopeFields.scopeAgenceIds,
    q: parsed.data.q,
    limit: parsed.data.limit,
  });
  return NextResponse.json({ items, produitCode: parsed.data.produitCode.trim().toUpperCase() }, { status: 200 });
}
