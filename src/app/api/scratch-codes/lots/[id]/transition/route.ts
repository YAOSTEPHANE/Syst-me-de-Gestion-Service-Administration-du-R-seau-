import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { zodBadRequest } from "@/lib/api/endpoint-helpers";
import { requireApiAuth } from "@/lib/auth/guards";
import { ensureGprGrattageIndexes, SCRATCH_CODE_STATUSES, transitionScratchLot } from "@/lib/lonaci/gpr-grattage";
import { GRATTAGE_API_ROLES } from "@/lib/lonaci/grattage-access";

const schema = z.object({
  targetStatus: z.enum(SCRATCH_CODE_STATUSES),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return zodBadRequest(parsed.error);
  }
  const auth = await requireApiAuth(request, { roles: [...GRATTAGE_API_ROLES] });
  if ("error" in auth) return auth.error;
  const { id } = await context.params;
  await ensureGprGrattageIndexes();
  try {
    await transitionScratchLot({ lotId: id, targetStatus: parsed.data.targetStatus, actor: auth.user });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "LOT_NOT_FOUND") return NextResponse.json({ message: "Lot introuvable." }, { status: 404 });
    if (code === "FORBIDDEN_TRANSITION") return NextResponse.json({ message: "Transition non autorisee." }, { status: 403 });
    return NextResponse.json({ message: "Transition impossible." }, { status: 500 });
  }
}
