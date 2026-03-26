import { NextRequest, NextResponse } from "next/server";

import { requireApiAuth } from "@/lib/auth/guards";
import { ensureGprGrattageIndexes, listGprExportLogs } from "@/lib/lonaci/gpr-grattage";

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, { roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"] });
  if ("error" in auth) return auth.error;
  await ensureGprGrattageIndexes();
  const logs = await listGprExportLogs();
  return NextResponse.json({ items: logs }, { status: 200 });
}
