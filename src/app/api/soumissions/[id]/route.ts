import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { badRequest, conflict } from "@/lib/api/error-responses";
import { zodBadRequest } from "@/lib/api/endpoint-helpers";
import { CLIENT_TYPE_DISTRIBUTEUR } from "@/lib/lonaci/client-constants";
import { SOUMISSION_STATUTS } from "@/lib/lonaci/soumission-constants";
import { updateSoumission } from "@/lib/lonaci/soumissions";
import { requireApiAuth } from "@/lib/auth/guards";

const patchSchema = z
  .object({
    nomComplet: z.string().trim().min(2).max(200).optional(),
    contact: z.string().trim().min(4).max(64).optional(),
    typeDistributeur: z.enum(CLIENT_TYPE_DISTRIBUTEUR).optional(),
    nombreTpe: z.coerce.number().int().min(0).max(9999).optional(),
    agenceId: z.string().trim().min(1).optional(),
    produitCode: z.string().trim().min(1).max(32).optional(),
    statut: z.enum(SOUMISSION_STATUTS).optional(),
    appele: z.boolean().optional(),
    date: z.string().datetime().optional(),
    observations: z.union([z.string().max(5000), z.null()]).optional(),
  })
  .strict();

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth(request, {
    roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
  });
  if ("error" in auth) return auth.error;

  const { id } = await context.params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return zodBadRequest(parsed.error, "Payload invalide");
  }

  if (Object.keys(parsed.data).length === 0) {
    return badRequest("Aucun champ a mettre a jour.", "EMPTY_PATCH");
  }

  let date: Date | undefined;
  if (parsed.data.date !== undefined) {
    date = new Date(parsed.data.date);
    if (Number.isNaN(date.getTime())) {
      return badRequest("Date invalide.", "INVALID_DATE");
    }
  }

  try {
    const item = await updateSoumission({
      id,
      actor: auth.user,
      nomComplet: parsed.data.nomComplet,
      contact: parsed.data.contact,
      typeDistributeur: parsed.data.typeDistributeur,
      nombreTpe: parsed.data.nombreTpe,
      agenceId: parsed.data.agenceId,
      produitCode: parsed.data.produitCode,
      statut: parsed.data.statut,
      appele: parsed.data.appele,
      date,
      observations: parsed.data.observations,
    });
    return NextResponse.json({ item }, { status: 200 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "SOUMISSION_NOT_FOUND") {
      return NextResponse.json({ message: "Non trouve" }, { status: 404 });
    }
    if (code === "SOUMISSION_IMMUTABLE") {
      return conflict("Soumission close (payée, annulée ou exonérée) : modification impossible.", code);
    }
    if (code === "AGENCE_FORBIDDEN") {
      return badRequest("Acces refuse pour cette agence.", "AGENCE_FORBIDDEN");
    }
    if (code === "TYPE_DISTRIBUTEUR_INVALID") {
      return badRequest("Type de distributeur invalide.", "TYPE_DISTRIBUTEUR_INVALID");
    }
    if (code === "PRODUIT_REQUIRED") {
      return badRequest("Produit requis.", "PRODUIT_REQUIRED");
    }
    return badRequest("Mise a jour impossible.", "UPDATE_FAILED");
  }
}
