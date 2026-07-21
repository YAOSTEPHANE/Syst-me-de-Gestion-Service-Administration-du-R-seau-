import { NextRequest, NextResponse } from "next/server";

import { requireApiAuth } from "@/lib/auth/guards";
import {
  assertCourrierComptabiliteDossierReadable,
  buildCourrierComptabiliteFromDossierId,
  renderCourrierComptabiliteClientPdf,
} from "@/lib/lonaci/courrier-comptabilite-client";
import { findVisibleDossierById } from "@/lib/lonaci/dossiers";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth(request, {
    roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE", "AUDITEUR"],
  });
  if ("error" in auth) {
    return auth.error;
  }

  const { id } = await context.params;
  if (!(await findVisibleDossierById(id, auth.user))) {
    return NextResponse.json({ message: "Dossier introuvable." }, { status: 404 });
  }
  try {
    const readable = await assertCourrierComptabiliteDossierReadable(id, auth.user);
    if (!readable) {
      return NextResponse.json({ message: "Dossier introuvable." }, { status: 404 });
    }

    const view = await buildCourrierComptabiliteFromDossierId(id, auth.user);
    if (!view) {
      return NextResponse.json(
        {
          message:
            "Courrier comptabilité indisponible : la caution doit être payée et une fiche définitive émise.",
        },
        { status: 409 },
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
    return NextResponse.json({ message: "Génération PDF impossible." }, { status: 500 });
  }
}
