import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { ensureCessionIndexes, transitionCession, type CessionStatus } from "@/lib/lonaci/cessions";
import { requireApiAuth } from "@/lib/auth/guards";

const schema = z.object({
  target: z.enum(["SAISIE_AGENT", "CONTROLE_CHEF_SECTION", "VALIDEE_CHEF_SERVICE", "REJETEE"]),
  commentaire: z.string().max(10000).optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth(request, { roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"] });
  if ("error" in auth) return auth.error;
  const { id } = await context.params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "Données invalides", issues: parsed.error.issues }, { status: 400 });
  }
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

