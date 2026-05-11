import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { badRequest, conflict, forbidden, notFound } from "@/lib/api/error-responses";
import { zodBadRequest } from "@/lib/api/endpoint-helpers";
import { requireApiAuth } from "@/lib/auth/guards";
import { CONTRAT_OPERATION_TYPES } from "@/lib/lonaci/constants";
import { canReadConcessionnaire } from "@/lib/lonaci/access";
import { findConcessionnaireById } from "@/lib/lonaci/concessionnaires";
import {
  ensureDossierIndexes,
  findDossierById,
  patchContratDossierPayload,
} from "@/lib/lonaci/dossiers";
import type { DossierDocument } from "@/lib/lonaci/types";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function dossierToJson(dossier: DossierDocument) {
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

const patchDossierPayloadSchema = z
  .object({
    observations: z.string().max(5000).nullable().optional(),
    commentaire: z.string().max(5000).nullable().optional(),
    dateEffet: z
      .string()
      .min(1)
      .refine((s) => !Number.isNaN(Date.parse(s)), { message: "dateEffet invalide" })
      .optional(),
    parentContratId: z.string().min(1).nullable().optional(),
    agenceId: z.string().min(1).optional(),
    produitCode: z.string().min(1).optional(),
    operationType: z.enum(CONTRAT_OPERATION_TYPES).optional(),
  })
  .refine(
    (body) =>
      body.observations !== undefined ||
      body.commentaire !== undefined ||
      body.dateEffet !== undefined ||
      body.parentContratId !== undefined ||
      body.agenceId !== undefined ||
      body.produitCode !== undefined ||
      body.operationType !== undefined,
    { message: "Au moins un champ a actualiser est requis.", path: ["root"] },
  );

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

  return NextResponse.json({ dossier: dossierToJson(dossier) }, { status: 200 });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth(request, {
    roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
    rbac: { resource: "DOSSIERS", action: "UPDATE" },
  });
  if ("error" in auth) {
    return auth.error;
  }

  const parsed = patchDossierPayloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return zodBadRequest(parsed.error, "Payload invalide");
  }

  const { id } = await context.params;
  await ensureDossierIndexes();

  try {
    const updated = await patchContratDossierPayload(id, parsed.data, auth.user);
    return NextResponse.json({ dossier: dossierToJson(updated) }, { status: 200 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "DOSSIER_NOT_FOUND") {
      return notFound("Dossier introuvable.");
    }
    if (code === "DOSSIER_TYPE_UNSUPPORTED") {
      return badRequest("Actualisation de payload reservee aux dossiers contrat.", "DOSSIER_TYPE_UNSUPPORTED");
    }
    if (code === "DOSSIER_NOT_EDITABLE") {
      return conflict("Le dossier n'est pas modifiable dans son statut actuel.", "DOSSIER_NOT_EDITABLE");
    }
    if (code === "PATCH_EMPTY") {
      return badRequest("Aucun champ a mettre a jour.", "PATCH_EMPTY");
    }
    if (code === "AGENCE_FORBIDDEN") {
      return forbidden("Acces refuse.", "AGENCE_FORBIDDEN");
    }
    if (code === "CONCESSIONNAIRE_NOT_FOUND") {
      return notFound("Concessionnaire introuvable.");
    }
    if (code === "PRODUIT_REQUIRED" || code === "PRODUIT_INVALID") {
      return badRequest("Produit invalide ou manquant.", code);
    }
    if (code === "PRODUIT_NOT_ALLOWED") {
      return badRequest("Produit non autorise pour ce point de vente.", "PRODUIT_NOT_ALLOWED");
    }
    if (code === "ACTIVE_CONTRACT_EXISTS") {
      return conflict(
        "Un contrat actif existe deja pour ce produit et ce concessionnaire.",
        "ACTIVE_CONTRACT_EXISTS",
      );
    }
    if (code === "PARENT_CONTRAT_REQUIRED") {
      return badRequest("Contrat d'origine obligatoire pour une actualisation.", "PARENT_CONTRAT_REQUIRED");
    }
    if (code === "PARENT_CONTRAT_INVALID") {
      return badRequest("Contrat d'origine invalide (actif, meme PDV et meme produit).", "PARENT_CONTRAT_INVALID");
    }
    if (code === "OPERATION_TYPE_INVALID") {
      return badRequest("Type d'operation invalide.", "OPERATION_TYPE_INVALID");
    }
    if (code === "AGENCE_INVALID") {
      return badRequest("Agence invalide pour ce concessionnaire.", "AGENCE_INVALID");
    }
    if (code === "DATE_EFFET_INVALID") {
      return badRequest("Date d'effet invalide.", "DATE_EFFET_INVALID");
    }
    return NextResponse.json({ message: "Mise a jour impossible." }, { status: 500 });
  }
}
