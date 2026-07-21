import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { badRequest, conflict, notFound, serverError } from "@/lib/api/error-responses";
import { zodBadRequest } from "@/lib/api/endpoint-helpers";
import { finalizeCaution, ensureSprint4Indexes, returnCautionForCorrection } from "@/lib/lonaci/sprint4";
import { requireApiAuth } from "@/lib/auth/guards";

const schema = z.object({
  decision: z.enum(["APPROUVER", "REJETER", "RETOURNER_POUR_CORRECTION"]),
  comment: z.string().trim().max(1000).optional(),
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
    parsed.data.decision === "APPROUVER"
      ? "FINALIZE"
      : parsed.data.decision === "REJETER"
        ? "REJECT"
        : "RETURN_FOR_CORRECTION";
  const auth = await requireApiAuth(request, {
    roles: ["CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
    rbac: { resource: "CAUTIONS", action: rbacAction },
  });
  if ("error" in auth) return auth.error;

  const { id } = await context.params;

  const { decision, comment } = parsed.data;
  await ensureSprint4Indexes();
  try {
    if (decision === "APPROUVER") {
      const fiche = await finalizeCaution(id, true, auth.user);
      return NextResponse.json({ ok: true, fiche }, { status: 200 });
    }
    if (decision === "REJETER") {
      await finalizeCaution(id, false, auth.user);
      return NextResponse.json({ ok: true }, { status: 200 });
    }
    const c = (comment ?? "").trim();
    if (!c) {
      return badRequest("Motif obligatoire pour un retour correction.", "MISSING_COMMENT");
    }
    await returnCautionForCorrection({ cautionId: id, comment: c, actor: auth.user });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "CAUTION_NOT_FOUND") {
      return notFound("Caution introuvable.", "CAUTION_NOT_FOUND");
    }
    if (code === "CAUTION_IMMUTABLE") {
      return conflict("Caution deja finalisee (statut immuable).", "CAUTION_IMMUTABLE");
    }
    if (code === "CAUTION_FICHE_PROVISOIRE") {
      return conflict(
        "Régularisez le paiement de la fiche provisoire avant de passer en PAYÉE.",
        "CAUTION_FICHE_PROVISOIRE",
      );
    }
    if (code === "CAUTION_PAYMENT_REFERENCE_REQUISE") {
      return conflict(
        "Référence de paiement obligatoire pour valider le paiement (statut PAYÉE).",
        "CAUTION_PAYMENT_REFERENCE_REQUISE",
      );
    }
    if (code === "ROLE_FORBIDDEN" || code === "CAUTION_WRONG_STATUS") {
      return NextResponse.json({ message: "Transition non autorisee." }, { status: 403 });
    }
    return serverError("Decision caution impossible.", "CAUTION_DECISION_FAILED");
  }
}

