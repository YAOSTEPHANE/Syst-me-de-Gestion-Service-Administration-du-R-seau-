import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { badRequest, conflict, notFound, serverError } from "@/lib/api/error-responses";
import { zodBadRequest } from "@/lib/api/endpoint-helpers";
import { ensureSprint4Indexes, exonererCaution } from "@/lib/lonaci/sprint4";
import { requireApiAuth } from "@/lib/auth/guards";

const schema = z.object({
  motif: z.string().trim().min(3).max(2000),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** Exonération de caution — décision Direction (chef de service). */
export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth(request, {
    roles: ["CHEF_SERVICE"],
    rbac: { resource: "CAUTIONS", action: "FINALIZE" },
  });
  if ("error" in auth) return auth.error;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return zodBadRequest(parsed.error);
  }

  const { id } = await context.params;
  await ensureSprint4Indexes();
  try {
    await exonererCaution({
      cautionId: id,
      motif: parsed.data.motif,
      actor: auth.user,
    });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "CAUTION_NOT_FOUND") {
      return notFound("Caution introuvable.", "CAUTION_NOT_FOUND");
    }
    if (code === "CAUTION_IMMUTABLE" || code === "CAUTION_DEJA_PAYEE" || code === "CAUTION_DEJA_EXONEREE") {
      return conflict("Exoneration impossible pour l'etat actuel de la caution.", code);
    }
    if (code === "CAUTION_EXONERATION_MOTIF_REQUIS") {
      return badRequest("Motif d'exoneration requis (3 caracteres minimum).", code);
    }
    if (code === "CAUTION_WRONG_STATUS") {
      return conflict("Statut de caution incompatible avec l'exoneration.", code);
    }
    return serverError("Exoneration impossible.", "CAUTION_EXONERER_FAILED");
  }
}
