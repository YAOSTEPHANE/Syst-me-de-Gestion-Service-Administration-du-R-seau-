import { NextResponse } from "next/server";
import { NextRequest } from "next/server";

import { clearSessionCookie } from "@/lib/auth/session";
import { getSessionFromRequest } from "@/lib/auth/session";
import { clearCurrentSession } from "@/lib/lonaci/users";

export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (session?.sub) {
    await clearCurrentSession(session.sub);
  }

  await clearSessionCookie();
  return NextResponse.json({ ok: true }, { status: 200 });
}
