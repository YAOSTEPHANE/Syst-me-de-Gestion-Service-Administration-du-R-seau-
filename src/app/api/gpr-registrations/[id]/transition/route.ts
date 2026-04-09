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
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "Donnees invalides", issues: parsed.error.issues }, { status: 400 });
  }
  const rbacAction =
    parsed.data.targetStatus === "VALIDE_N1"
      ? "VALIDATE_N1"
      : parsed.data.targetStatus === "VALIDE_N2"
        ? "VALIDATE_N2"
        : parsed.data.targetStatus === "SUIVI_CHEF_SERVICE"
          ? "FINALIZE"
          : parsed.data.targetStatus === "REJETE"
            ? "REJECT"
            : "UPDATE";
  const auth = await requireApiAuth(request, {
    roles: ["CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
    rbac: { resource: "DOSSIERS", action: rbacAction },
  });
  if ("error" in auth) return auth.error;
  const { id } = await context.params;
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
