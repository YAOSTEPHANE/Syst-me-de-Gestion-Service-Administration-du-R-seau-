import { NextRequest, NextResponse } from "next/server";

import { requireApiAuth } from "@/lib/auth/guards";
import { ackMonitoringEvent } from "@/lib/observability/events";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth(request, { roles: ["CHEF_SERVICE"] });
  if ("error" in auth) return auth.error;

  const { id } = await context.params;
  const ok = await ackMonitoringEvent({
    id,
    actorUserId: auth.user._id ?? "",
  });
  if (!ok) {
    return NextResponse.json({ message: "Evenement introuvable ou deja traite." }, { status: 404 });
  }
  return NextResponse.json({ ok: true }, { status: 200 });
}

