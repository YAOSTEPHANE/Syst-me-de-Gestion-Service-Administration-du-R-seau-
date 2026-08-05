import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { badRequest } from "@/lib/api/error-responses";
import { zodBadRequest } from "@/lib/api/endpoint-helpers";
import { requireListAgenceScope, listAgenceScopeFields } from "@/lib/api/list-agence-scope";
import { canCreateConcessionnaireForAgence } from "@/lib/lonaci/access";
import { CLIENT_TYPE_DISTRIBUTEUR, normalizeClientTypeDistributeur } from "@/lib/lonaci/client-constants";
import {
  SOUMISSION_STATUTS,
  SOUMISSION_STATUT_DEFAULT,
} from "@/lib/lonaci/soumission-constants";
import {
  createSoumission,
  ensureSoumissionsIndexes,
  listSoumissions,
} from "@/lib/lonaci/soumissions";
import { requireApiAuth } from "@/lib/auth/guards";

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  agenceId: z.string().optional(),
  produitCode: z.string().optional(),
  statut: z.enum(SOUMISSION_STATUTS).optional(),
  /** "true" | "false" — filtre appelé / non appelé */
  appele: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  q: z.string().optional(),
});

const createSchema = z
  .object({
    nomComplet: z.string().trim().min(2).max(200),
    contact: z.string().trim().min(4).max(64),
    typeDistributeur: z.enum(CLIENT_TYPE_DISTRIBUTEUR).default("NOUVEAU"),
    nombreTpe: z.coerce.number().int().min(0).max(9999).default(0),
    agenceId: z.string().trim().min(1),
    produitCode: z.string().trim().min(1).max(32),
    statut: z.enum(SOUMISSION_STATUTS).optional(),
    appele: z.boolean().optional(),
    date: z.string().datetime().optional(),
    observations: z.union([z.string().max(5000), z.null()]).optional(),
  })
  .strict();

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, {
    roles: [
      "AGENT",
      "CHEF_SECTION",
      "ASSIST_CDS",
      "CHEF_SERVICE",
      "SUPERVISEUR_REGIONAL",
      "AUDITEUR",
      "LECTURE_SEULE",
    ],
  });
  if ("error" in auth) return auth.error;

  const parsed = listSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
  if (!parsed.success) {
    return zodBadRequest(parsed.error, "Parametres invalides");
  }

  await ensureSoumissionsIndexes();
  const agenceScope = requireListAgenceScope(auth.user, parsed.data.agenceId);
  if (!agenceScope.ok) return agenceScope.response;

  const result = await listSoumissions({
    page: parsed.data.page,
    pageSize: parsed.data.pageSize,
    actor: auth.user,
    ...listAgenceScopeFields(agenceScope),
    produitCode: parsed.data.produitCode?.trim() || undefined,
    statut: parsed.data.statut,
    appele: parsed.data.appele,
    q: parsed.data.q?.trim() || undefined,
  });

  return NextResponse.json(result, { status: 200 });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(request, {
    roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
  });
  if ("error" in auth) return auth.error;

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return zodBadRequest(parsed.error, "Payload invalide");
  }

  if (!canCreateConcessionnaireForAgence(auth.user, parsed.data.agenceId)) {
    return badRequest("Acces refuse pour cette agence.", "AGENCE_FORBIDDEN");
  }

  const typeDistributeur =
    normalizeClientTypeDistributeur(parsed.data.typeDistributeur) ?? "NOUVEAU";
  const date = parsed.data.date ? new Date(parsed.data.date) : new Date();
  if (Number.isNaN(date.getTime())) {
    return badRequest("Date invalide.", "INVALID_DATE");
  }

  await ensureSoumissionsIndexes();
  const created = await createSoumission({
    nomComplet: parsed.data.nomComplet,
    contact: parsed.data.contact,
    typeDistributeur,
    nombreTpe: parsed.data.nombreTpe,
    agenceId: parsed.data.agenceId,
    produitCode: parsed.data.produitCode,
    statut: parsed.data.statut ?? SOUMISSION_STATUT_DEFAULT,
    appele: parsed.data.appele ?? false,
    date,
    observations: parsed.data.observations ?? null,
    actorId: auth.user._id ?? "",
  });

  return NextResponse.json({ item: created }, { status: 201 });
}
