import { NextRequest, NextResponse } from "next/server";

import { requireApiAuth } from "@/lib/auth/guards";
import { findConcessionnaireById } from "@/lib/lonaci/concessionnaires";
import {
  buildDossierDechargeProvisoireView,
  renderDossierDechargeProvisoirePdf,
} from "@/lib/lonaci/dossier-decharge-provisoire";
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
    return NextResponse.json({ message: "Decharge reservee aux dossiers contrat." }, { status: 400 });
  }

  const concessionnaire = await findConcessionnaireById(dossier.concessionnaireId);
  if (!concessionnaire || concessionnaire.deletedAt) {
    return NextResponse.json({ message: "Dossier introuvable." }, { status: 404 });
  }

  const view = await buildDossierDechargeProvisoireView(id);
  if (!view) {
    return NextResponse.json(
      {
        message:
          "Decharge provisoire indisponible : dossier finalise, checklist complete, ou aucun document configure.",
      },
      { status: 409 },
    );
  }

  const pdf = await renderDossierDechargeProvisoirePdf(view);
  const filename = `decharge-provisoire-${dossier.reference.replace(/[^\w-]+/g, "_")}.pdf`;
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
