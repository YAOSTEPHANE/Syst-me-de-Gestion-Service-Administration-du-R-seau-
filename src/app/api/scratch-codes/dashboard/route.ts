import { NextRequest, NextResponse } from "next/server";

import { requireApiAuth } from "@/lib/auth/guards";
import { ensureGprGrattageIndexes, getScratchDispatcherDashboard } from "@/lib/lonaci/gpr-grattage";
import { GRATTAGE_API_ROLES } from "@/lib/lonaci/grattage-access";

/** Tableau de bord dispatcher (codes distribués, solde, alertes rupture). */
export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, { roles: [...GRATTAGE_API_ROLES] });
  if ("error" in auth) return auth.error;
  await ensureGprGrattageIndexes();
  const dashboard = await getScratchDispatcherDashboard();
  return NextResponse.json(dashboard, { status: 200 });
}
