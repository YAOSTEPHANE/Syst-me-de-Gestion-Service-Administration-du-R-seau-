import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { ensureSuccessionIndexes, listSuccessionStaleAlerts } from "@/lib/lonaci/succession";
import { requireApiAuth } from "@/lib/auth/guards";
import { zodBadRequest } from "@/lib/api/endpoint-helpers";

const querySchema = z.object({
  minDaysInactive: z.coerce.number().int().min(0).optional().default(0),
  limit: z.coerce.number().int().min(1).max(500).optional().default(200),
});

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, {
    roles: ["CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
  });
  if ("error" in auth) return auth.error;

  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
  if (!parsed.success) {
    return zodBadRequest(parsed.error, "Paramètres invalides");
  }

  await ensureSuccessionIndexes();
  const items = await listSuccessionStaleAlerts();
  const filtered = items
    .filter((row) => row.daysInactive >= parsed.data.minDaysInactive)
    .slice(0, parsed.data.limit);
  return NextResponse.json({ items: filtered, total: filtered.length }, { status: 200 });
}
