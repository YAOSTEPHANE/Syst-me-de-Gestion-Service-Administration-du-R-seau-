import { NextRequest, NextResponse } from "next/server";

import { markNotificationRead } from "@/lib/lonaci/notifications";
import { requireApiAuth } from "@/lib/auth/guards";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth(request);
  if ("error" in auth) {
    return auth.error;
  }
  const { id } = await context.params;
  const ok = await markNotificationRead(id, auth.user._id ?? "");
  if (!ok) {
    return NextResponse.json({ message: "Notification introuvable" }, { status: 404 });
  }
  return NextResponse.json({ ok: true }, { status: 200 });
}
