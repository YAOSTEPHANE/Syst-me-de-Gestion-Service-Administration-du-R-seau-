import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { conflict, notFound, serverError } from "@/lib/api/error-responses";
import { zodBadRequest } from "@/lib/api/endpoint-helpers";
import { CAUTION_ENCAISSEMENT_MODES } from "@/lib/lonaci/constants";
import { ensureSprint4Indexes, regulariserCautionPaiement } from "@/lib/lonaci/sprint4";
import { requireApiAuth } from "@/lib/auth/guards";

const schema = z.object({
  modeReglement: z.enum(CAUTION_ENCAISSEMENT_MODES),
  paymentReference: z.string().max(200).optional(),
  dueDate: z.string().datetime().optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth(request, {
    roles: ["ASSIST_CDS", "CHEF_SERVICE"],
    rbac: { resource: "CAUTIONS", action: "CREATE" },
  });
  if ("error" in auth) return auth.error;

  const { id } = await context.params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return zodBadRequest(parsed.error);
  }

  await ensureSprint4Indexes();
  try {
    const fiche = await regulariserCautionPaiement({
      cautionId: id,
      modeReglement: parsed.data.modeReglement,
      paymentReference: parsed.data.paymentReference?.trim() ?? "",
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
      actor: auth.user,
    });
    return NextResponse.json({ ok: true, fiche }, { status: 200 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "CAUTION_NOT_FOUND") {
      return notFound("Caution introuvable.", "CAUTION_NOT_FOUND");
    }
    if (code === "CAUTION_NOT_PROVISOIRE") {
      return conflict("Cette caution n'est pas une fiche provisoire active.", "CAUTION_NOT_PROVISOIRE");
    }
    if (code === "CAUTION_IMMUTABLE") {
      return conflict("Caution deja finalisee (statut immuable).", "CAUTION_IMMUTABLE");
    }
    if (code === "CAUTION_WRONG_STATUS") {
      return conflict("Regularisation impossible dans ce statut.", "CAUTION_WRONG_STATUS");
    }
    if (code === "CAUTION_REGULARISATION_REFERENCE_REQUISE") {
      return conflict("Reference de paiement obligatoire.", "CAUTION_REGULARISATION_REFERENCE_REQUISE");
    }
    return serverError("Regularisation impossible.", "CAUTION_REGULARISER_FAILED");
  }
}
