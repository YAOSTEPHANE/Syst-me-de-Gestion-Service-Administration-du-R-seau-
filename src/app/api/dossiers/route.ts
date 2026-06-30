import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { badRequest, conflict, forbidden, notFound, serverError } from "@/lib/api/error-responses";
import { zodBadRequest } from "@/lib/api/endpoint-helpers";
import { canReadClient } from "@/lib/lonaci/access";
import { findLonaciClientById } from "@/lib/lonaci/clients";
import { isClientStatutEligibleForContrat } from "@/lib/lonaci/client-constants";
import { resolveListAgenceFilter } from "@/lib/lonaci/access";
import { CONTRAT_OPERATION_TYPES, DOSSIER_STATUSES, DOSSIER_TYPES } from "@/lib/lonaci/constants";
import { createDossier, ensureDossierIndexes, listDossiers } from "@/lib/lonaci/dossiers";
import { requireApiAuth } from "@/lib/auth/guards";

const createSchema = z.object({
  type: z.enum(DOSSIER_TYPES),
  lonaciClientId: z.string().min(1),
  payload: z.object({
    produitCode: z.string().min(1),
    operationType: z.enum(CONTRAT_OPERATION_TYPES),
    dateEffet: z.string().datetime(),
    commentaire: z.string().max(5000).optional(),
  }),
});

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(DOSSIER_STATUSES).optional(),
  type: z.enum(DOSSIER_TYPES).optional(),
  q: z.string().trim().max(120).optional(),
  concessionnaireId: z.string().trim().max(120).optional(),
  sortField: z.enum(["updatedAt", "reference", "status"]).optional().default("updatedAt"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
});

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, {
    roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
  });
  if ("error" in auth) {
    return auth.error;
  }
  const raw = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = listSchema.safeParse(raw);
  if (!parsed.success) {
    return zodBadRequest(parsed.error, "Parametres invalides");
  }
  await ensureDossierIndexes();
  const scopeResult = resolveListAgenceFilter(auth.user, undefined);
  const agenceRestriction = scopeResult.ok
    ? { agenceId: scopeResult.agenceId, agenceIds: scopeResult.agenceIds }
    : {};
  const result = await listDossiers(
    parsed.data.page,
    parsed.data.pageSize,
    parsed.data.status,
    parsed.data.type,
    agenceRestriction,
    parsed.data.q,
    parsed.data.concessionnaireId,
    parsed.data.sortField,
    parsed.data.sortOrder,
  );
  return NextResponse.json(result, { status: 200 });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(request, {
    roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
  });
  if ("error" in auth) {
    return auth.error;
  }
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return zodBadRequest(parsed.error);
  }

  const client = await findLonaciClientById(parsed.data.lonaciClientId);
  if (!client) {
    return notFound("Client introuvable.", "CLIENT_NOT_FOUND");
  }
  if (!canReadClient(auth.user, client)) {
    return forbidden("Acces refuse pour cette agence.", "AGENCE_FORBIDDEN");
  }
  if (!isClientStatutEligibleForContrat(client.statut)) {
    if (client.statut === "EN_ATTENTE_N1" || client.statut === "REJETE") {
      return conflict("Validation N1 requise avant dossier.", "CLIENT_INSCRIPTION_PENDING");
    }
    return conflict("Client bloque.", "CLIENT_BLOQUE");
  }

  await ensureDossierIndexes();
  try {
    const dossier = await createDossier({
      type: parsed.data.type,
      lonaciClientId: parsed.data.lonaciClientId,
      payload: {
        produitCode: parsed.data.payload.produitCode.trim().toUpperCase(),
        operationType: parsed.data.payload.operationType,
        dateEffet: parsed.data.payload.dateEffet,
        commentaire: parsed.data.payload.commentaire ?? null,
      },
      actor: auth.user,
    });
    return NextResponse.json({ dossier }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "ACTIVE_CONTRACT_EXISTS") {
      return conflict(
        "Un contrat actif existe deja pour ce produit et ce client.",
        "ACTIVE_CONTRACT_EXISTS",
      );
    }
    if (code === "DOSSIER_CLIENT_REQUIRED" || code === "PARTY_REQUIRED") {
      return badRequest("Un client Lonaci est requis pour ouvrir un dossier.", "DOSSIER_CLIENT_REQUIRED");
    }
    if (code === "CLIENT_INSCRIPTION_PENDING") {
      return conflict("Validation N1 client requise.", "CLIENT_INSCRIPTION_PENDING");
    }
    if (code === "CLIENT_BLOQUE" || code === "CLIENT_NOT_FOUND") {
      return conflict("Client non eligible.", code);
    }
    if (code === "PRODUIT_INVALID") {
      return badRequest("Produit invalide.", "PRODUIT_INVALID");
    }
    if (code === "AGENCE_FORBIDDEN") {
      return forbidden("Acces refuse pour cette agence.", "AGENCE_FORBIDDEN");
    }
    return serverError("Creation du dossier impossible.", "DOSSIER_CREATE_FAILED");
  }
}
