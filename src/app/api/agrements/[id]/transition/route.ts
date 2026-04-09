import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { conflict, forbidden, notFound, serverError } from "@/lib/api/error-responses";
import { zodBadRequest } from "@/lib/api/endpoint-helpers";
import { ensureAgrementsIndexes, transitionAgrement } from "@/lib/lonaci/agrements";
import { requireApiAuth } from "@/lib/auth/guards";

const schema = z.object({
  target: z.enum(["CONTROLE", "TRANSMIS", "FINALISE"]),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return zodBadRequest(parsed.error);
  }
  const rbacAction =
    parsed.data.target === "CONTROLE"
      ? "VALIDATE_N1"
      : parsed.data.target === "TRANSMIS"
        ? "VALIDATE_N2"
        : "FINALIZE";
  const auth = await requireApiAuth(request, {
    roles: ["CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
    rbac: { resource: "AGREMENTS", action: rbacAction },
  });
  if ("error" in auth) return auth.error;
  const { id } = await context.params;

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
      return notFound("Agrement introuvable.", "AGREMENT_NOT_FOUND");
    }
    if (code === "FORBIDDEN_TRANSITION") {
      return forbidden("Transition interdite pour votre role.", "FORBIDDEN_TRANSITION");
    }
    if (code === "INVALID_TRANSITION") {
      return conflict("Transition invalide.", "INVALID_TRANSITION");
    }
    return serverError("Transition impossible.", "AGREMENT_TRANSITION_FAILED");
  }
}

