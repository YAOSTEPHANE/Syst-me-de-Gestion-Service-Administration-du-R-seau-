import { NextRequest, NextResponse } from "next/server";

import { ensureSuccessionIndexes, listSuccessionStaleAlerts } from "@/lib/lonaci/succession";
import { requireApiAuth } from "@/lib/auth/guards";

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, {
    roles: ["CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
  });
  if ("error" in auth) return auth.error;

  await ensureSuccessionIndexes();
  const items = await listSuccessionStaleAlerts();
  return NextResponse.json({ items }, { status: 200 });
}
