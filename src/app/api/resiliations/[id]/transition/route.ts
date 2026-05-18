import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { badRequest, notFound } from "@/lib/api/error-responses";
import { zodBadRequest } from "@/lib/api/endpoint-helpers";
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
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return zodBadRequest(parsed.error);
  }
  const auth = await requireApiAuth(request, {
    roles: ["CHEF_SERVICE"],
    rbac: { resource: "DOSSIERS", action: "FINALIZE" },
  });
  if ("error" in auth) return auth.error;
  const { id } = await context.params;
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
      return notFound("Dossier de résiliation introuvable.", "RESILIATION_NOT_FOUND");
    }
    if (code === "RESILIATION_CONFIRMATION_REQUIRED") {
      return badRequest(
        "Confirmation explicite requise: la résiliation est irréversible.",
        "RESILIATION_CONFIRMATION_REQUIRED",
      );
    }
    return badRequest("Transition impossible.", "RESILIATION_TRANSITION_FAILED");
  }
}

