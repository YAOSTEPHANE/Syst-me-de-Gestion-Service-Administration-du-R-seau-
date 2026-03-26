import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { finalizeCaution, ensureSprint4Indexes, returnCautionForCorrection } from "@/lib/lonaci/sprint4";
import { requireApiAuth } from "@/lib/auth/guards";

const schema = z.object({
  decision: z.enum(["APPROUVER", "REJETER", "RETOURNER_POUR_CORRECTION"]),
  comment: z.string().trim().max(1000).optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth(request, { roles: ["CHEF_SERVICE"] });
  if ("error" in auth) return auth.error;

  const { id } = await context.params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "Donnees invalides", issues: parsed.error.issues }, { status: 400 });
  }

  const { decision, comment } = parsed.data;
  await ensureSprint4Indexes();
  try {
    if (decision === "APPROUVER") {
      await finalizeCaution(id, true, auth.user);
      return NextResponse.json({ ok: true }, { status: 200 });
    }
    if (decision === "REJETER") {
      await finalizeCaution(id, false, auth.user);
      return NextResponse.json({ ok: true }, { status: 200 });
    }
    const c = (comment ?? "").trim();
    if (!c) {
      return NextResponse.json({ message: "Motif obligatoire pour un retour correction." }, { status: 400 });
    }
    await returnCautionForCorrection({ cautionId: id, comment: c, actor: auth.user });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "CAUTION_NOT_FOUND") {
      return NextResponse.json({ message: "Caution introuvable." }, { status: 404 });
    }
    if (code === "CAUTION_IMMUTABLE") {
      return NextResponse.json({ message: "Caution deja finalisee (statut immuable)." }, { status: 409 });
    }
    return NextResponse.json({ message: "Decision caution impossible." }, { status: 500 });
  }
}

