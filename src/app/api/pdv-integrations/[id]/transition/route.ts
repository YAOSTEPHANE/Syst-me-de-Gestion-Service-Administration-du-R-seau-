import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { ensureSprint4Indexes, transitionPdvIntegration } from "@/lib/lonaci/sprint4";
import { requireApiAuth } from "@/lib/auth/guards";

const schema = z.object({
  targetStatus: z.enum(["EN_TRAITEMENT", "INTEGRE_GPR", "FINALISE"]),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth(request, { roles: ["CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"] });
  if ("error" in auth) return auth.error;
  const { id } = await context.params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "Donnees invalides", issues: parsed.error.issues }, { status: 400 });
  }
  await ensureSprint4Indexes();
  try {
    await transitionPdvIntegration({
      integrationId: id,
      targetStatus: parsed.data.targetStatus,
      actor: auth.user,
    });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "PDV_INTEGRATION_NOT_FOUND") {
      return NextResponse.json({ message: "Integration introuvable." }, { status: 404 });
    }
    if (code === "FORBIDDEN_TRANSITION") {
      return NextResponse.json({ message: "Role non autorise pour cette transition." }, { status: 403 });
    }
    if (code === "INVALID_PDV_STATUS_TRANSITION") {
      return NextResponse.json({ message: "Transition de statut invalide." }, { status: 409 });
    }
    return NextResponse.json({ message: "Transition impossible." }, { status: 500 });
  }
}

