import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { zodBadRequest } from "@/lib/api/endpoint-helpers";
import {
  attestationsListScopeAgenceId,
  ensureAttestationsDomiciliationIndexes,
  getAttestationsDomiciliationDashboardIndicators,
} from "@/lib/lonaci/attestations-domiciliation";
import { requireApiAuth } from "@/lib/auth/guards";

const statsQuerySchema = z.object({
  type: z.enum(["ATTESTATION_REVENU", "DOMICILIATION_PRODUIT"]).optional(),
  concessionnaireId: z.string().optional(),
  produitCode: z.string().optional(),
  agenceId: z.string().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
});

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, {
    roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
  });
  if ("error" in auth) return auth.error;

  const parsed = statsQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  if (!parsed.success) {
    return zodBadRequest(parsed.error, "Parametres invalides");
  }

  await ensureAttestationsDomiciliationIndexes();
  const scopeAgenceId = attestationsListScopeAgenceId(auth.user);
  const requestedAgenceId = parsed.data.agenceId?.trim() || undefined;
  const agenceId = scopeAgenceId ?? requestedAgenceId;

  const indicators = await getAttestationsDomiciliationDashboardIndicators({
    type: parsed.data.type,
    concessionnaireId: parsed.data.concessionnaireId?.trim() || undefined,
    produitCode: parsed.data.produitCode?.trim() || undefined,
    agenceId,
    scopeAgenceId,
    dateFrom: parsed.data.dateFrom ? new Date(parsed.data.dateFrom) : undefined,
    dateTo: parsed.data.dateTo ? new Date(parsed.data.dateTo) : undefined,
  });

  return NextResponse.json({ indicators }, { status: 200 });
}
