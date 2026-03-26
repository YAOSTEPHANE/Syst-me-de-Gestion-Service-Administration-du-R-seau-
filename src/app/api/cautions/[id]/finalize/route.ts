import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { finalizeCaution, ensureSprint4Indexes } from "@/lib/lonaci/sprint4";
import { requireApiAuth } from "@/lib/auth/guards";

const schema = z.object({
  paid: z.literal(true),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth(request, {
    roles: ["CHEF_SERVICE"],
  });
  if ("error" in auth) return auth.error;
  const { id } = await context.params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "Donnees invalides", issues: parsed.error.issues }, { status: 400 });
  }

  await ensureSprint4Indexes();
  try {
    await finalizeCaution(id, parsed.data.paid, auth.user);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "CAUTION_NOT_FOUND") {
      return NextResponse.json({ message: "Caution introuvable." }, { status: 404 });
    }
    if (code === "CAUTION_IMMUTABLE") {
      return NextResponse.json({ message: "Caution deja finalisee (statut immuable)." }, { status: 409 });
    }
    return NextResponse.json({ message: "Finalisation caution impossible." }, { status: 500 });
  }
}
