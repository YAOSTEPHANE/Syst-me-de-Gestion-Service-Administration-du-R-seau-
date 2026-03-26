import { NextRequest, NextResponse } from "next/server";

import { ensureSprint4Indexes, listCautionAlertsJ10 } from "@/lib/lonaci/sprint4";
import { requireApiAuth } from "@/lib/auth/guards";

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, {
    roles: ["ASSIST_CDS", "CHEF_SERVICE"],
  });
  if ("error" in auth) return auth.error;

  await ensureSprint4Indexes();
  const items = await listCautionAlertsJ10();
  return NextResponse.json({ items }, { status: 200 });
}
