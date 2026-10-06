import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { badRequest, conflict, forbidden, notFound, serverError } from "@/lib/api/error-responses";
import { zodBadRequest } from "@/lib/api/endpoint-helpers";
import { requireApiAuth } from "@/lib/auth/guards";
import { CAUTION_ENCAISSEMENT_MODES } from "@/lib/lonaci/constants";
import { applySoumissionCircuitCommand } from "@/lib/lonaci/soumission-circuit-service";
import { ensureSoumissionsIndexes } from "@/lib/lonaci/soumissions";

const motif = z.string().trim().min(3).max(2000);

const commandSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("FINALISER_PAYEE"),
      paymentMode: z.enum(CAUTION_ENCAISSEMENT_MODES),
      paymentReference: z.string().trim().min(3).max(120),
    })
    .strict(),
  z.object({ action: z.literal("ANNULER"), motif }).strict(),
  z.object({ action: z.literal("EXONERER"), motif }).strict(),
  z.object({ action: z.literal("RETOUR_CORRECTION"), motif }).strict(),
  z.object({ action: z.literal("RENVOYER") }).strict(),
]);

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth(request, {
    roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
  });
  if ("error" in auth) return auth.error;

  const parsed = commandSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return zodBadRequest(parsed.error, "Payload invalide");
  }

  const { id } = await context.params;
  await ensureSoumissionsIndexes();

  try {
    const item = await applySoumissionCircuitCommand({ id, actor: auth.user, command: parsed.data });
    return NextResponse.json({ item }, { status: 200 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    switch (code) {
      case "SOUMISSION_NOT_FOUND":
        return notFound("Soumission introuvable.", code);
      case "SOUMISSION_CIRCUIT_ACTION_FORBIDDEN":
        return forbidden("Action non autorisée pour votre rôle ou pour l'étape actuelle.", code);
      case "SOUMISSION_CIRCUIT_CONFLICT":
        return conflict("La soumission a été modifiée entre-temps. Rechargez la liste.", code);
      case "SOUMISSION_MOTIF_REQUIS":
        return badRequest("Un motif d'au moins 3 caractères est requis.", code);
      case "SOUMISSION_REFERENCE_PAIEMENT_REQUISE":
        return badRequest("La référence de paiement (N° reçu caisse) est requise.", code);
      default:
        return serverError("Action impossible sur le circuit de la soumission.", "SOUMISSION_CIRCUIT_FAILED");
    }
  }
}
