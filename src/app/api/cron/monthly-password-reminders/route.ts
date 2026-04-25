import { NextRequest, NextResponse } from "next/server";

import { verifyCronSecretFromHeaders } from "@/lib/security/cron-auth";
import { runMonthlyPasswordResetReminderJob } from "@/lib/lonaci/monthly-password-reset-reminder";
import { getDatabase } from "@/lib/mongodb";

const RUNS = "report_cron_runs";

function authorizeCron(request: NextRequest): boolean {
  return verifyCronSecretFromHeaders(
    request.headers.get("authorization"),
    request.headers.get("x-cron-secret"),
    process.env.CRON_SECRET,
  );
}

export async function POST(request: NextRequest) {
  if (!authorizeCron(request)) {
    if (!process.env.CRON_SECRET?.trim()) {
      return NextResponse.json({ message: "CRON_SECRET non configure" }, { status: 503 });
    }
    return NextResponse.json({ message: "Non autorise" }, { status: 401 });
  }

  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const vercelHost = process.env.VERCEL_URL?.trim();
  const appOrigin = fromEnv
    ? fromEnv.replace(/\/$/, "")
    : vercelHost
      ? `https://${vercelHost}`
      : request.nextUrl.origin;

  const result = await runMonthlyPasswordResetReminderJob({ appOrigin });

  const db = await getDatabase();
  await db.collection(RUNS).insertOne({
    kind: "monthly_password_reminders",
    createdAt: new Date(),
    summary: result,
  });

  return NextResponse.json({ ok: true, ...result }, { status: 200 });
}
