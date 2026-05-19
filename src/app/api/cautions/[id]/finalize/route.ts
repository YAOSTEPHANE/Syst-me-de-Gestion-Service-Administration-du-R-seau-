import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { conflict, notFound, serverError } from "@/lib/api/error-responses";
import { zodBadRequest } from "@/lib/api/endpoint-helpers";
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
    rbac: { resource: "CAUTIONS", action: "FINALIZE" },
  });
  if ("error" in auth) return auth.error;
  const { id } = await context.params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return zodBadRequest(parsed.error);
  }

  await ensureSprint4Indexes();
  try {
    await finalizeCaution(id, parsed.data.paid, auth.user);
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
        "Regularisez le paiement de la fiche provisoire avant finalisation.",
        "CAUTION_FICHE_PROVISOIRE",
      );
    }
    if (code === "CAUTION_WRONG_STATUS") {
      return conflict("La caution ne peut pas etre finalisee dans ce statut.", "CAUTION_WRONG_STATUS");
    }
    if (code === "CAUTION_PAYMENT_REFERENCE_REQUISE") {
      return conflict(
        "Référence de paiement obligatoire pour passer en statut PAYÉE (régularisez la fiche provisoire ou saisissez la référence).",
        "CAUTION_PAYMENT_REFERENCE_REQUISE",
      );
    }
    return serverError("Finalisation caution impossible.", "CAUTION_FINALIZE_FAILED");
  }
}
