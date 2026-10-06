import { NextRequest } from "next/server";

import { conflict, notFound, serverError } from "@/lib/api/error-responses";
import { requireApiAuth } from "@/lib/auth/guards";
import { buildAndRenderSoumissionFichePaiementPdf } from "@/lib/lonaci/soumission-fiche-paiement";
import { ensureSoumissionsIndexes } from "@/lib/lonaci/soumissions";
import { createPdfResponse } from "@/lib/pdf/response";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth(request, {
    roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
  });
  if ("error" in auth) return auth.error;

  const { id } = await context.params;
  await ensureSoumissionsIndexes();

  try {
    const { pdf, filename } = await buildAndRenderSoumissionFichePaiementPdf({
      soumissionId: id,
      actor: auth.user,
    });
    return createPdfResponse(pdf, {
      filename,
      disposition: "inline",
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "SOUMISSION_NOT_FOUND") {
      return notFound("Soumission introuvable.", "SOUMISSION_NOT_FOUND");
    }
    if (code === "SOUMISSION_CIRCUIT_CLOS") {
      return conflict("Soumission close : la fiche de paiement caisse ne peut plus être émise.", code);
    }
    return serverError("Generation de la fiche paiement impossible.", "FICHE_PAIEMENT_PDF_FAILED");
  }
}
