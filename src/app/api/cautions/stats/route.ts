import { NextRequest, NextResponse } from "next/server";

import { listAgenceScopeFields, requireListAgenceScope } from "@/lib/api/list-agence-scope";
import { requireApiAuth } from "@/lib/auth/guards";
import { ensureSprint4Indexes, getCautionCounters } from "@/lib/lonaci/sprint4";

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, {
    roles: ["ASSIST_CDS", "CHEF_SERVICE"],
  });
  if ("error" in auth) return auth.error;

  await ensureSprint4Indexes();
  const agenceScope = requireListAgenceScope(auth.user);
  if (!agenceScope.ok) return agenceScope.response;
  const counters = await getCautionCounters(
    auth.user,
    listAgenceScopeFields(agenceScope),
  );

  return NextResponse.json({ counters }, { status: 200 });
}

