import { NextRequest, NextResponse } from "next/server";

import { requireApiAuth } from "@/lib/auth/guards";
import { ensureGprGrattageIndexes, syncGprRegistration } from "@/lib/lonaci/gpr-grattage";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth(request, { roles: ["ASSIST_CDS", "CHEF_SERVICE"] });
  if ("error" in auth) return auth.error;
  const { id } = await context.params;
  await ensureGprGrattageIndexes();
  try {
    await syncGprRegistration(id, auth.user);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "GPR_REGISTRATION_NOT_FOUND") {
      return NextResponse.json({ message: "Enregistrement GPR introuvable." }, { status: 404 });
    }
    if (code === "GPR_SYNC_NOT_CONFIGURED") {
      return NextResponse.json(
        { message: "Synchronisation API non configurée (GPR_API_ENDPOINT / GPR_API_KEY)." },
        { status: 400 },
      );
    }
    if (code === "GPR_SYNC_STATUS_NOT_ELIGIBLE") {
      return NextResponse.json({ message: "Statut non éligible à la synchronisation." }, { status: 409 });
    }
    return NextResponse.json({ message: "Echec de synchronisation API GPR." }, { status: 502 });
  }
}
