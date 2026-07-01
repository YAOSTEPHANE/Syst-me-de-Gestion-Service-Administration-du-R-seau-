import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { conflict, forbidden, notFound } from "@/lib/api/error-responses";
import { friendlyErrorMessage } from "@/lib/lonaci/friendly-messages";
import { zodBadRequest } from "@/lib/api/endpoint-helpers";
import { canMutateConcessionnaireCore, canReadConcessionnaire } from "@/lib/lonaci/access";
import { transitionConcessionnaireInscription } from "@/lib/lonaci/concessionnaire-inscription";
import {
  ensureConcessionnaireIndexes,
  findConcessionnaireById,
  sanitizeConcessionnairePublic,
} from "@/lib/lonaci/concessionnaires";
import { requireApiAuth } from "@/lib/auth/guards";

const transitionSchema = z.object({
  action: z.enum(["SUBMIT", "VALIDATE_N1", "REJECT", "RETURN_TO_DRAFT"]),
  comment: z.string().max(2000).nullable().optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth(request, {
    roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
  });
  if ("error" in auth) {
    return auth.error;
  }

  const parsed = transitionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return zodBadRequest(parsed.error);
  }

  const { id } = await context.params;
  await ensureConcessionnaireIndexes();
  const existing = await findConcessionnaireById(id);
  if (!existing || existing.deletedAt) {
    return notFound("Non trouve", "CONCESSIONNAIRE_NOT_FOUND");
  }
  if (!canReadConcessionnaire(auth.user, existing)) {
    return forbidden("Acces refuse", "AGENCE_FORBIDDEN");
  }
  if (!canMutateConcessionnaireCore(auth.user, existing)) {
    return forbidden("Modification interdite", "CONCESSIONNAIRE_MUTATION_FORBIDDEN");
  }

  try {
    const updated = await transitionConcessionnaireInscription({
      concessionnaireId: id,
      action: parsed.data.action,
      comment: parsed.data.comment,
      actor: auth.user,
    });
    return NextResponse.json({ concessionnaire: sanitizeConcessionnairePublic(updated) }, { status: 200 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "CONCESSIONNAIRE_NOT_FOUND") {
      return notFound("Non trouve", "CONCESSIONNAIRE_NOT_FOUND");
    }
    if (code === "FORBIDDEN_TRANSITION" || code.startsWith("INSCRIPTION_") || code.startsWith("DOSSIER_")) {
      return forbidden(friendlyErrorMessage(code), code);
    }
    const clientCodes = new Set([
      "NOM_REQUIRED",
      "PRENOM_REQUIRED",
      "CNI_REQUIRED",
      "TELEPHONE_REQUIRED",
      "GPS_REQUIRED",
      "PRODUITS_REQUIRED",
      "CHECKLIST_INCOMPLETE",
      "PHOTO_REQUIRED",
      "AGENCE_REQUIRED",
      "AGENCE_INVALID",
    ]);
    if (clientCodes.has(code)) {
      return conflict(friendlyErrorMessage(code), code);
    }
    throw error;
  }
}
