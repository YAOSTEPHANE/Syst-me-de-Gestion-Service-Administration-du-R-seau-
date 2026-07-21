import { NextRequest, NextResponse } from "next/server";

import { requireApiAuth } from "@/lib/auth/guards";
import {
  buildDossierDechargeContratView,
  renderDossierDechargeContratPdf,
} from "@/lib/lonaci/dossier-decharge-contrat";
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
  const dossier = await findVisibleDossierById(id, auth.user);
  if (!dossier) {
    return NextResponse.json({ message: "Dossier introuvable." }, { status: 404 });
  }
  if (dossier.type !== "CONTRAT_ACTUALISATION") {
    return NextResponse.json({ message: "Décharge contrat réservée aux dossiers contrat." }, { status: 400 });
  }

  const produitCode = request.nextUrl.searchParams.get("produitCode")?.trim() || undefined;
  const view = await buildDossierDechargeContratView(id, auth.user, produitCode);
  if (!view) {
    return NextResponse.json(
      {
        message:
          "Fiche de décharge indisponible : le dossier doit être finalisé et le contrat généré avant remise au client.",
      },
      { status: 409 },
    );
  }

  const pdf = await renderDossierDechargeContratPdf(view);
  const suffix = produitCode ? `-${produitCode.replace(/[^\w-]+/g, "_")}` : "";
  const filename = `decharge-contrat-client-${dossier.reference.replace(/[^\w-]+/g, "_")}${suffix}.pdf`;
  const inline = request.nextUrl.searchParams.get("view") === "1";

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
