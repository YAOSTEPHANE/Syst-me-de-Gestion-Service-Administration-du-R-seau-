import { NextRequest, NextResponse } from "next/server";

import { canReadConcessionnaire } from "@/lib/lonaci/access";
import { findConcessionnaireById } from "@/lib/lonaci/concessionnaires";
import { findDossierById } from "@/lib/lonaci/dossiers";
import { requireApiAuth } from "@/lib/auth/guards";

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

  const concessionnaire = await findConcessionnaireById(dossier.concessionnaireId);
  if (!concessionnaire || concessionnaire.deletedAt || !canReadConcessionnaire(auth.user, concessionnaire)) {
    return NextResponse.json({ message: "Acces refuse." }, { status: 403 });
  }

  return NextResponse.json(
    {
      dossier: {
        id: dossier._id ?? "",
        type: dossier.type,
        reference: dossier.reference,
        status: dossier.status,
        concessionnaireId: dossier.concessionnaireId,
        agenceId: dossier.agenceId,
        payload: dossier.payload,
        history: dossier.history.map((h) => ({
          status: h.status,
          actedByUserId: h.actedByUserId,
          actedAt: h.actedAt.toISOString(),
          comment: h.comment,
        })),
        createdAt: dossier.createdAt.toISOString(),
        updatedAt: dossier.updatedAt.toISOString(),
      },
    },
    { status: 200 },
  );
}

