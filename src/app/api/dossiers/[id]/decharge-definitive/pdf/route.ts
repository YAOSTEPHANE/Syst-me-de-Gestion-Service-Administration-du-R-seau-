import { NextRequest, NextResponse } from "next/server";

import { requireApiAuth } from "@/lib/auth/guards";
import { canReadConcessionnaire } from "@/lib/lonaci/access";
import { findConcessionnaireById } from "@/lib/lonaci/concessionnaires";
import {
  buildDossierDechargeDefinitiveView,
  renderDossierDechargeDefinitivePdf,
} from "@/lib/lonaci/dossier-decharge-definitive";
import { prepareContratFromDechargeDefinitive, parseContratGenerePayload } from "@/lib/lonaci/contrat-document";
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

  const view = await buildDossierDechargeDefinitiveView(id);
  if (!view) {
    return NextResponse.json(
      {
        message:
          "Decharge definitive indisponible : checklist incomplete, caution non payee ou reference de paiement absente.",
      },
      { status: 409 },
    );
  }

  if (!parseContratGenerePayload(dossier.payload ?? {})) {
    try {
      await prepareContratFromDechargeDefinitive(id, auth.user);
    } catch {
      // La décharge reste téléchargeable même si la préparation contrat échoue
    }
  }

  const pdf = await renderDossierDechargeDefinitivePdf(view);
  const filename = `decharge-definitive-${dossier.reference.replace(/[^\w-]+/g, "_")}.pdf`;
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
