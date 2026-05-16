import { NextRequest, NextResponse } from "next/server";

import { requireApiAuth } from "@/lib/auth/guards";
import { canReadConcessionnaire } from "@/lib/lonaci/access";
import { findConcessionnaireById } from "@/lib/lonaci/concessionnaires";
import {
  buildDossierDechargeProvisoireView,
  renderDossierDechargeProvisoirePdf,
} from "@/lib/lonaci/dossier-decharge-provisoire";
import { findDossierById } from "@/lib/lonaci/dossiers";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth(request, {
    roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
  });
  if ("error" in auth) {
    return auth.error;
  }

  const { id } = await context.params;
  const dossier = await findDossierById(id);
  if (!dossier || dossier.deletedAt) {
    return NextResponse.json({ message: "Dossier introuvable." }, { status: 404 });
  }
  if (dossier.type !== "CONTRAT_ACTUALISATION") {
    return NextResponse.json({ message: "Decharge reservee aux dossiers contrat." }, { status: 400 });
  }

  const concessionnaire = await findConcessionnaireById(dossier.concessionnaireId);
  if (!concessionnaire || concessionnaire.deletedAt || !canReadConcessionnaire(auth.user, concessionnaire)) {
    return NextResponse.json({ message: "Acces refuse." }, { status: 403 });
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
