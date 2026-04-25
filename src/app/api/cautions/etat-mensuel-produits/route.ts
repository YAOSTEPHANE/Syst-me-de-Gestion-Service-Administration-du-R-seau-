import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { zodBadRequest } from "@/lib/api/endpoint-helpers";
import { requireApiAuth } from "@/lib/auth/guards";
import { ensureSprint4Indexes, listCautionEtatMensuelParProduit } from "@/lib/lonaci/sprint4";

const querySchema = z.object({
  months: z.coerce.number().int().min(1).max(36).optional().default(12),
});

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, {
    roles: ["CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
  });
  if ("error" in auth) return auth.error;

  const raw = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = querySchema.safeParse(raw);
  if (!parsed.success) {
    return zodBadRequest(parsed.error, "Parametres invalides");
  }

  await ensureSprint4Indexes();
  const rows = await listCautionEtatMensuelParProduit(parsed.data.months);

  return NextResponse.json({ rows, months: parsed.data.months }, { status: 200 });
}
