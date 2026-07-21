import { NextRequest, NextResponse } from "next/server";

import { notFound, serverError } from "@/lib/api/error-responses";
import { buildActeDelocalisationView, renderActeDelocalisationPdf } from "@/lib/lonaci/acte-delocalisation";
import {
  ensureCessionIndexes,
  getCessionById,
  markActeDelocalisationGenere,
} from "@/lib/lonaci/cessions";
import { requireApiAuth } from "@/lib/auth/guards";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** Génère l’acte de délocalisation au format PDF. */
export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth(request, {
    roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE", "AUDITEUR"],
  });
  if ("error" in auth) return auth.error;

  const { id } = await context.params;
  await ensureCessionIndexes();

  try {
    const visible = await getCessionById(id, auth.user);
    if (!visible || (visible.kind !== "DELOCALISATION" && visible.kind !== "CESSION_DELOCALISATION")) {
      return notFound("Demande de délocalisation introuvable.", "ACTE_DELOCALISATION_NOT_FOUND");
    }
    const view = await buildActeDelocalisationView(id);
    if (!view) {
      return notFound("Demande de délocalisation introuvable.", "ACTE_DELOCALISATION_NOT_FOUND");
    }
    const pdf = await renderActeDelocalisationPdf(view);
    await markActeDelocalisationGenere(id);
    const filename = `acte-delocalisation-${view.reference.replace(/[^\w-]+/g, "_")}.pdf`;
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return serverError("Génération de l'acte de délocalisation impossible.", "ACTE_DELOCALISATION_PDF_FAILED");
  }
}
