import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { zodBadRequest } from "@/lib/api/endpoint-helpers";
import { requireApiAuth } from "@/lib/auth/guards";
import { GRATTAGE_CONTRAT_STATUTS } from "@/lib/lonaci/constants";
import { ensureGrattageContratIndexes, transitionGrattageContrat } from "@/lib/lonaci/grattage-contrats";
import { GRATTAGE_CONTRAT_ROLES } from "@/lib/lonaci/grattage-access";

const bodySchema = z.object({
  targetStatut: z.enum(GRATTAGE_CONTRAT_STATUTS),
  comment: z.string().max(2000).nullable().optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth(request, { roles: [...GRATTAGE_CONTRAT_ROLES] });
  if ("error" in auth) return auth.error;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return zodBadRequest(parsed.error);
  }
  const { id } = await context.params;
  await ensureGrattageContratIndexes();
  try {
    await transitionGrattageContrat({
      contratId: id,
      targetStatut: parsed.data.targetStatut,
      comment: parsed.data.comment ?? null,
      actor: auth.user,
    });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "GRATTAGE_CONTRAT_NOT_FOUND") {
      return NextResponse.json({ message: "Contrat introuvable." }, { status: 404 });
    }
    if (code === "FORBIDDEN_TRANSITION") {
      return NextResponse.json({ message: "Transition non autorisee." }, { status: 403 });
    }
    return NextResponse.json({ message: "Transition impossible." }, { status: 500 });
  }
}
