import { NextRequest, NextResponse } from "next/server";

import { badRequest, conflict, forbidden, notFound } from "@/lib/api/error-responses";
import { requireApiAuth } from "@/lib/auth/guards";
import { assertDossierPartyReadable, contratPartyFromDossier } from "@/lib/lonaci/dossier-contrat-party";
import { prepareContratFromDechargeDefinitive } from "@/lib/lonaci/contrat-document";
import {
  buildDossierContratStatutMetierFields,
  ensureDossierIndexes,
  findDossierById,
  transitionDossier,
} from "@/lib/lonaci/dossiers";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function dossierToJson(dossier: NonNullable<Awaited<ReturnType<typeof findDossierById>>>) {
  return {
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
  };
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth(request, {
    roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
    rbac: { resource: "DOSSIERS", action: "UPDATE" },
  });
  if ("error" in auth) {
    return auth.error;
  }

  const { id } = await context.params;
  await ensureDossierIndexes();

  const dossier = await findDossierById(id);
  if (!dossier || dossier.deletedAt) {
    return notFound("Dossier introuvable.");
  }
  if (dossier.type !== "CONTRAT_ACTUALISATION") {
    return badRequest("Generation contrat reservee aux dossiers contrat.", "DOSSIER_TYPE_UNSUPPORTED");
  }

  const party = contratPartyFromDossier(dossier);
  if (!party) {
    return notFound("Dossier sans rattachement client ou PDV.");
  }
  try {
    await assertDossierPartyReadable(party, auth.user);
  } catch {
    return forbidden("Acces refuse.", "AGENCE_FORBIDDEN");
  }

  try {
    const { dossier: prepared, contratGenere, created } = await prepareContratFromDechargeDefinitive(id, auth.user);

    let current = prepared;
    if (current.status === "BROUILLON" || current.status === "REJETE") {
      current = await transitionDossier(
        id,
        "SOUMIS",
        auth.user,
        "Contrat genere depuis decharge definitive — soumis au circuit de validation.",
      );
    }

    const statutFields = await buildDossierContratStatutMetierFields(current);
    return NextResponse.json(
      {
        dossier: { ...dossierToJson(current), ...statutFields },
        contratGenere,
        created,
        submitted: current.status === "SOUMIS",
      },
      { status: created ? 201 : 200 },
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "DECHARGE_DEFINITIVE_REQUIRED") {
      return conflict(
        "Decharge definitive requise : checklist complete et caution payee avec reference de paiement.",
        "DECHARGE_DEFINITIVE_REQUIRED",
      );
    }
    if (code === "DOSSIER_PAYLOAD_INVALID") {
      return badRequest("Payload dossier contrat invalide.", "DOSSIER_PAYLOAD_INVALID");
    }
    if (code === "CONCESSIONNAIRE_NOT_FOUND" || code === "PARTY_NOT_FOUND") {
      return notFound("Titulaire du dossier introuvable.");
    }
    return NextResponse.json({ message: "Generation du contrat impossible." }, { status: 500 });
  }
}
