import { NextRequest, NextResponse } from "next/server";

import { requireApiAuth } from "@/lib/auth/guards";
import { ensureSprint4Indexes, getCautionCounters } from "@/lib/lonaci/sprint4";

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, {
    roles: ["ASSIST_CDS", "CHEF_SERVICE"],
  });
  if ("error" in auth) return auth.error;

  await ensureSprint4Indexes();
  const counters = await getCautionCounters();

  return NextResponse.json({ counters }, { status: 200 });
}

