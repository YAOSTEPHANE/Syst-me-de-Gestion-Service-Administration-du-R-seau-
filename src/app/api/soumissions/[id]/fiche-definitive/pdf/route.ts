import { NextRequest } from "next/server";

import { conflict, notFound, serverError } from "@/lib/api/error-responses";
import { requireApiAuth } from "@/lib/auth/guards";
import { buildAndRenderSoumissionFicheDefinitivePdf } from "@/lib/lonaci/soumission-fiche-definitive";
import { createPdfResponse } from "@/lib/pdf/response";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth(request, {
    roles: [
      "AGENT",
      "CHEF_SECTION",
      "ASSIST_CDS",
      "CHEF_SERVICE",
      "SUPERVISEUR_REGIONAL",
      "AUDITEUR",
      "LECTURE_SEULE",
    ],
  });
  if ("error" in auth) return auth.error;

  const { id } = await context.params;
  try {
    const { pdf, filename } = await buildAndRenderSoumissionFicheDefinitivePdf({
      soumissionId: id,
      actor: auth.user,
    });
    return createPdfResponse(pdf, { filename, disposition: "inline" });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "SOUMISSION_NOT_FOUND") {
      return notFound("Soumission introuvable.", code);
    }
    if (code === "SOUMISSION_NON_PAYEE") {
      return conflict("La fiche définitive n'existe que pour une soumission payée.", code);
    }
    return serverError("Génération de la fiche définitive impossible.", "FICHE_DEFINITIVE_PDF_FAILED");
  }
}
