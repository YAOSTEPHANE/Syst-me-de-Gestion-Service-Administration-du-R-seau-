import { NextRequest, NextResponse } from "next/server";

import { notFound, serverError } from "@/lib/api/error-responses";
import { requireApiAuth } from "@/lib/auth/guards";
import {
  buildCourrierComptabiliteFromCautionId,
  renderCourrierComptabiliteClientPdf,
} from "@/lib/lonaci/courrier-comptabilite-client";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth(request, {
    rbac: { resource: "CAUTIONS", action: "READ" },
  });
  if ("error" in auth) return auth.error;

  const { id } = await context.params;
  try {
    const view = await buildCourrierComptabiliteFromCautionId(id);
    if (!view) {
      return notFound(
        "Courrier comptabilité indisponible : la caution doit être payée et une fiche définitive émise.",
        "COURRIER_COMPTABILITE_NOT_FOUND",
      );
    }
    const pdf = await renderCourrierComptabiliteClientPdf(view);
    const filename = `${view.referenceCourrier.replace(/[^\w-]+/g, "_")}.pdf`;
    const inline = request.nextUrl.searchParams.get("view") === "1";
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return serverError("Génération PDF impossible.", "COURRIER_COMPTABILITE_PDF_FAILED");
  }
}
