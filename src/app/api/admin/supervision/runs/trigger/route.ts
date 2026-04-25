import { NextRequest, NextResponse } from "next/server";

import { requireApiAuth } from "@/lib/auth/guards";
import { POST as runDailyJobs } from "@/app/api/cron/daily-jobs/route";

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(request, { roles: ["CHEF_SERVICE"] });
  if ("error" in auth) return auth.error;

  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    return NextResponse.json({ message: "CRON_SECRET non configure" }, { status: 503 });
  }

  const url = new URL("/api/cron/daily-jobs", request.nextUrl.origin);
  const cronReq = new NextRequest(url, {
    method: "POST",
    headers: {
      "x-cron-secret": cronSecret,
      "x-supervision-force": "1",
      "x-supervision-only": "1",
    },
  });

  const res = await runDailyJobs(cronReq);
  if (res.status >= 400) return res;
  return NextResponse.json({ ok: true, message: "Relance supervision executee." }, { status: 200 });
}
