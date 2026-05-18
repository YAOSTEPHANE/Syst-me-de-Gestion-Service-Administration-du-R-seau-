import { NextRequest, NextResponse } from "next/server";

import { requireApiAuth } from "@/lib/auth/guards";
import { ensureGprGrattageIndexes, exportGprCsv } from "@/lib/lonaci/gpr-grattage";
import { LONACI_ROLES } from "@/lib/lonaci/constants";

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, { roles: [...LONACI_ROLES] });
  if ("error" in auth) return auth.error;
  await ensureGprGrattageIndexes();
  const out = await exportGprCsv(auth.user);
  return new NextResponse(out.csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${out.filename}"`,
    },
  });
}
