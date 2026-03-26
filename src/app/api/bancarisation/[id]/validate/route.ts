import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { findConcessionnaireById } from "@/lib/lonaci/concessionnaires";
import {
  findBancarisationRequestById,
  sanitizeBancarisationRequestPublic,
  validateBancarisationRequest,
} from "@/lib/lonaci/bancarisation";
import { requireApiAuth } from "@/lib/auth/guards";

const schema = z.object({
  decision: z.enum(["VALIDER", "REJETER"]),
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

  const reqDoc = await findBancarisationRequestById(id);
  if (!reqDoc) {
    return NextResponse.json({ message: "Demande introuvable." }, { status: 404 });
  }

  const concessionnaire = await findConcessionnaireById(reqDoc.concessionnaireId);
  if (!concessionnaire || concessionnaire.deletedAt) {
    return NextResponse.json({ message: "Concessionnaire introuvable." }, { status: 404 });
  }

  try {
    const updated = await validateBancarisationRequest({
      requestId: id,
      decision: parsed.data.decision,
      comment: parsed.data.comment?.trim() || null,
      actor: auth.user,
    });
    return NextResponse.json({ request: sanitizeBancarisationRequestPublic(updated) }, { status: 200 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "REQUEST_NOT_FOUND") {
      return NextResponse.json({ message: "Demande introuvable." }, { status: 404 });
    }
    if (code === "REQUEST_NOT_PENDING") {
      return NextResponse.json({ message: "Cette demande a deja ete traitee." }, { status: 409 });
    }
    return NextResponse.json({ message: "Validation impossible." }, { status: 500 });
  }
}
