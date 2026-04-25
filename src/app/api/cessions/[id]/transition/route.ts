import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { zodBadRequest } from "@/lib/api/endpoint-helpers";
import { ensureCessionIndexes, transitionCession, type CessionStatus } from "@/lib/lonaci/cessions";
import { checkPermission, resolveRbacAction } from "@/lib/auth/checkPermission";

const schema = z.object({
  target: z.enum(["SAISIE_AGENT", "CONTROLE_CHEF_SECTION", "VALIDATION_N2", "VALIDEE_CHEF_SERVICE", "REJETEE"]),
  commentaire: z.string().max(10000).optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return zodBadRequest(parsed.error);
  }
  const rbacAction = resolveRbacAction(parsed.data.target, {
    CONTROLE_CHEF_SECTION: "VALIDATE_N1",
    VALIDATION_N2: "VALIDATE_N2",
    VALIDEE_CHEF_SERVICE: "FINALIZE",
    REJETEE: "REJECT",
    SAISIE_AGENT: "UPDATE",
  });
  const auth = await checkPermission(request, {
    roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
    resource: "CESSIONS",
    action: rbacAction,
  });
  if ("error" in auth) return auth.error;
  const { id } = await context.params;
  await ensureCessionIndexes();
  try {
    await transitionCession({
      id,
      target: parsed.data.target as CessionStatus,
      commentaire: parsed.data.commentaire,
      actor: auth.user,
    });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Transition impossible";
    if (msg === "CESSION_NOT_FOUND") return NextResponse.json({ message: "Cession introuvable" }, { status: 404 });
    if (msg === "FORBIDDEN_TRANSITION") return NextResponse.json({ message: "Transition interdite pour votre rôle" }, { status: 403 });
    if (msg === "INVALID_TRANSITION") return NextResponse.json({ message: "Transition invalide" }, { status: 400 });
    return NextResponse.json({ message: msg }, { status: 400 });
  }
}

