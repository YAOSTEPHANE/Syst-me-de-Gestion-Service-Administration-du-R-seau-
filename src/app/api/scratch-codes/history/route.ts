import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { zodBadRequest } from "@/lib/api/endpoint-helpers";
import { requireApiAuth } from "@/lib/auth/guards";
import { ensureGprGrattageIndexes, listScratchHistoryByConcessionnaire } from "@/lib/lonaci/gpr-grattage";
import { GRATTAGE_API_ROLES } from "@/lib/lonaci/grattage-access";

const querySchema = z.object({
  concessionnaireId: z.string().min(1),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

/** §9.1 — Historique complet des lots / codes par concessionnaire. */
export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, { roles: [...GRATTAGE_API_ROLES] });
  if ("error" in auth) return auth.error;
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
  if (!parsed.success) {
    return zodBadRequest(parsed.error, "Parametres invalides");
  }
  await ensureGprGrattageIndexes();
  const data = await listScratchHistoryByConcessionnaire(parsed.data.concessionnaireId, {
    page: parsed.data.page,
    pageSize: parsed.data.pageSize,
  });
  return NextResponse.json(data, { status: 200 });
}
