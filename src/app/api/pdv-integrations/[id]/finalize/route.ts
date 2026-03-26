import { NextRequest, NextResponse } from "next/server";

import { ensureSprint4Indexes, finalizePdvIntegration } from "@/lib/lonaci/sprint4";
import { requireApiAuth } from "@/lib/auth/guards";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth(request, {
    roles: ["CHEF_SERVICE"],
  });
  if ("error" in auth) return auth.error;
  const { id } = await context.params;

  await ensureSprint4Indexes();
  try {
    const result = await finalizePdvIntegration(id, auth.user);
    return NextResponse.json({ ok: true, ...result }, { status: 200 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "PDV_INTEGRATION_NOT_FOUND") {
      return NextResponse.json({ message: "Integration introuvable." }, { status: 404 });
    }
    if (code === "GPS_REQUIRED") {
      return NextResponse.json({ message: "GPS obligatoire pour finaliser l integration." }, { status: 409 });
    }
    if (code === "INVALID_PDV_STATUS_TRANSITION") {
      return NextResponse.json(
        { message: "Transition invalide: passez d abord la demande au statut INTEGRE_GPR." },
        { status: 409 },
      );
    }
    return NextResponse.json({ message: "Finalisation integration impossible." }, { status: 500 });
  }
}
