import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { ensureAgrementsIndexes, transitionAgrement } from "@/lib/lonaci/agrements";
import { requireApiAuth } from "@/lib/auth/guards";

const schema = z.object({
  target: z.enum(["CONTROLE", "TRANSMIS", "FINALISE"]),
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
  await ensureAgrementsIndexes();
  try {
    await transitionAgrement({
      id,
      target: parsed.data.target,
      role: auth.user.role,
      actorId: auth.user._id ?? "",
    });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "AGREMENT_NOT_FOUND") {
      return NextResponse.json({ message: "Agrement introuvable." }, { status: 404 });
    }
    if (code === "FORBIDDEN_TRANSITION") {
      return NextResponse.json({ message: "Transition interdite pour votre role." }, { status: 403 });
    }
    if (code === "INVALID_TRANSITION") {
      return NextResponse.json({ message: "Transition invalide." }, { status: 409 });
    }
    return NextResponse.json({ message: "Transition impossible." }, { status: 500 });
  }
}

