import { NextRequest, NextResponse } from "next/server";

import { notFound, serverError } from "@/lib/api/error-responses";
import {
  buildCautionFicheProvisoireViewForConcessionnaire,
  renderCautionFicheProvisoirePdf,
} from "@/lib/lonaci/caution-fiche-provisoire";
import { canReadConcessionnaire } from "@/lib/lonaci/access";
import { ensureConcessionnaireIndexes, findConcessionnaireById } from "@/lib/lonaci/concessionnaires";
import { appendCautionFicheProvisoirePdfAudit } from "@/lib/lonaci/inscription-caution";
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

  try {
    const view = await buildCautionFicheProvisoireViewForConcessionnaire(id);
    if (!view) {
      return notFound(
        "Fiche provisoire de caution indisponible pour ce dossier.",
        "FICHE_CAUTION_PROVISOIRE_NOT_FOUND",
      );
    }
    const pdf = await renderCautionFicheProvisoirePdf(view);
    await appendCautionFicheProvisoirePdfAudit({
      concessionnaireId: id,
      cautionId: view.cautionId,
      userId: auth.user._id ?? "",
      numeroDossier: view.numeroDossier,
    });
    const filename = `${view.numeroDossier.replace(/[^\w-]+/g, "_")}.pdf`;
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return serverError("Generation PDF impossible.", "FICHE_CAUTION_PROVISOIRE_PDF_FAILED");
  }
}
