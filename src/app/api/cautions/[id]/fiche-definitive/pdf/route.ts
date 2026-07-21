import { NextRequest, NextResponse } from "next/server";

import { notFound, serverError } from "@/lib/api/error-responses";
import {
  buildCautionFicheDefinitiveView,
  renderCautionFicheDefinitivePdf,
} from "@/lib/lonaci/caution-fiche-definitive";
import { findVisibleCautionById } from "@/lib/lonaci/sprint4";
import { requireApiAuth } from "@/lib/auth/guards";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth(request, {
    rbac: { resource: "CAUTIONS", action: "READ" },
  });
  if ("error" in auth) return auth.error;

  const { id } = await context.params;
  if (!(await findVisibleCautionById(id, auth.user))) {
    return notFound("Fiche definitive introuvable pour cette caution.", "FICHE_DEFINITIVE_NOT_FOUND");
  }
  try {
    const view = await buildCautionFicheDefinitiveView(id);
    if (!view) {
      return notFound("Fiche definitive introuvable pour cette caution.", "FICHE_DEFINITIVE_NOT_FOUND");
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
    return serverError("Generation PDF impossible.", "FICHE_DEFINITIVE_PDF_FAILED");
  }
}
