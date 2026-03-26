import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { validateResiliation } from "@/lib/lonaci/resiliations";
import { requireApiAuth } from "@/lib/auth/guards";

const schema = z.object({
  target: z.literal("RESILIE"),
  /** Confirmation explicite : la résiliation est irréversible. */
  confirmIrreversible: z.literal(true),
  commentaire: z.string().optional(),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiAuth(request, { roles: ["CHEF_SERVICE"] });
  if ("error" in auth) return auth.error;
  const { id } = await context.params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "Donnees invalides", issues: parsed.error.issues }, { status: 400 });
  }
  try {
    await validateResiliation({
      id,
      confirmIrreversible: parsed.data.confirmIrreversible,
      commentaire: parsed.data.commentaire ?? null,
      actor: auth.user,
    });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    const code = e instanceof Error ? e.message : "UNKNOWN";
    if (code === "RESILIATION_NOT_FOUND") {
      return NextResponse.json({ message: "Dossier de résiliation introuvable." }, { status: 404 });
    }
    if (code === "RESILIATION_CONFIRMATION_REQUIRED") {
      return NextResponse.json(
        { message: "Confirmation explicite requise: la résiliation est irréversible." },
        { status: 400 },
      );
    }
    return NextResponse.json({ message: "Transition impossible." }, { status: 400 });
  }
}

