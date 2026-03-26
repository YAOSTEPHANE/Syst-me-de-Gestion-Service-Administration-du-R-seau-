import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireApiAuth } from "@/lib/auth/guards";
import { ensureGprGrattageIndexes, GPR_REGISTRATION_STATUSES, transitionGprRegistration } from "@/lib/lonaci/gpr-grattage";

const schema = z.object({
  targetStatus: z.enum(GPR_REGISTRATION_STATUSES),
  comment: z.string().max(1000).nullable().optional(),
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
  await ensureGprGrattageIndexes();
  try {
    await transitionGprRegistration({
      registrationId: id,
      targetStatus: parsed.data.targetStatus,
      comment: parsed.data.comment ?? null,
      actor: auth.user,
    });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "GPR_REGISTRATION_NOT_FOUND") {
      return NextResponse.json({ message: "Enregistrement GPR introuvable." }, { status: 404 });
    }
    if (code === "FORBIDDEN_TRANSITION") {
      return NextResponse.json({ message: "Transition non autorisee." }, { status: 403 });
    }
    return NextResponse.json({ message: "Transition impossible." }, { status: 500 });
  }
}
