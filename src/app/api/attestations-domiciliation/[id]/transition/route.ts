import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { zodBadRequest } from "@/lib/api/endpoint-helpers";
import { ensureAttestationsDomiciliationIndexes, transitionDemandeAttestationDomiciliation } from "@/lib/lonaci/attestations-domiciliation";
import { checkPermission, resolveRbacAction } from "@/lib/auth/checkPermission";

const schema = z.object({
  target: z.enum(["TRANSMIS", "FINALISE"]),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return zodBadRequest(parsed.error);
  }
  const auth = await checkPermission(request, {
    roles: ["ASSIST_CDS", "CHEF_SERVICE"],
    resource: "DOSSIERS",
    action: resolveRbacAction(parsed.data.target, {
      TRANSMIS: "VALIDATE_N2",
      FINALISE: "FINALIZE",
    }),
  });
  if ("error" in auth) return auth.error;
  const { id } = await context.params;

  await ensureAttestationsDomiciliationIndexes();
  try {
    await transitionDemandeAttestationDomiciliation({
      id,
      target: parsed.data.target,
      role: auth.user.role,
      actorId: auth.user._id ?? "",
    });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "DEMANDE_NOT_FOUND") {
      return NextResponse.json({ message: "Demande introuvable." }, { status: 404 });
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

