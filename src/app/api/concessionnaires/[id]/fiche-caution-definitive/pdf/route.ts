import { NextRequest, NextResponse } from "next/server";

import { notFound, serverError } from "@/lib/api/error-responses";
import {
  buildCautionFicheDefinitiveView,
  renderCautionFicheDefinitivePdf,
} from "@/lib/lonaci/caution-fiche-definitive";
import { canReadConcessionnaire } from "@/lib/lonaci/access";
import { ensureConcessionnaireIndexes, findConcessionnaireById } from "@/lib/lonaci/concessionnaires";
import { getInscriptionCautionSummary } from "@/lib/lonaci/inscription-caution";
import { requireApiAuth } from "@/lib/auth/guards";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth(request, {
    roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
  });
  if ("error" in auth) return auth.error;

  const { id } = await context.params;
  await ensureConcessionnaireIndexes();
  const doc = await findConcessionnaireById(id);
  if (!doc || doc.deletedAt) {
    return notFound("Concessionnaire introuvable.", "CONCESSIONNAIRE_NOT_FOUND");
  }
  if (!canReadConcessionnaire(auth.user, doc)) {
    return NextResponse.json({ message: "Acces refuse" }, { status: 403 });
  }

  const summary = await getInscriptionCautionSummary(id);
  if (!summary.cautionId || summary.status !== "PAYEE") {
    return notFound(
      "Fiche definitive disponible apres paiement et validation de la caution.",
      "FICHE_CAUTION_DEFINITIVE_NOT_FOUND",
    );
  }

  try {
    const view = await buildCautionFicheDefinitiveView(summary.cautionId);
    if (!view) {
      return notFound("Fiche definitive introuvable.", "FICHE_CAUTION_DEFINITIVE_NOT_FOUND");
    }
    const pdf = await renderCautionFicheDefinitivePdf(view);
    const filename = `${view.numeroFicheDefinitive.replace(/[^\w-]+/g, "_")}.pdf`;
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return serverError("Generation PDF impossible.", "FICHE_CAUTION_DEFINITIVE_PDF_FAILED");
  }
}
