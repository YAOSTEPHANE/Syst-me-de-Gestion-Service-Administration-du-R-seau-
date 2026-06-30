import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { zodBadRequest } from "@/lib/api/endpoint-helpers";
import { forbidden } from "@/lib/api/error-responses";
import { createRegistry, ensureRegistryIndexes, listRegistries } from "@/lib/lonaci/lonaci-registries";
import { enforcedAgenceIdOnCreate, resolveListAgenceFilter, userMatchesAgence } from "@/lib/lonaci/access";
import { listAgenceScopeFields } from "@/lib/api/list-agence-scope";
import { requireApiAuth } from "@/lib/auth/guards";

const moduleEnum = z.enum(["AGREMENT", "CESSION", "GPR"]);

const listSchema = z.object({
  module: moduleEnum,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().max(120).optional(),
  statut: z.string().min(1).max(64).optional(),
  agenceId: z.string().min(1).max(64).optional(),
});

const createSchema = z.object({
  module: moduleEnum,
  titre: z.string().min(2).max(500),
  concessionnaireId: z.union([z.string().min(1), z.null()]).optional(),
  lonaciClientId: z.union([z.string().min(1), z.null()]).optional(),
  agenceId: z.union([z.string().min(1), z.null()]).optional(),
  statut: z.string().min(1).max(64),
  commentaire: z.union([z.string().max(10000), z.null()]).optional(),
});

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, {
    roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
  });
  if ("error" in auth) return auth.error;

  const raw = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = listSchema.safeParse(raw);
  if (!parsed.success) {
    return zodBadRequest(parsed.error, "Parametres invalides");
  }

  const agenceScope = resolveListAgenceFilter(auth.user, parsed.data.agenceId);
  if (!agenceScope.ok) {
    return forbidden("Acces refuse pour cette agence.", "AGENCE_FORBIDDEN");
  }

  await ensureRegistryIndexes();
  const scopeFields = listAgenceScopeFields({
    ok: true,
    agenceId: agenceScope.agenceId,
    agenceIds: agenceScope.agenceIds,
  });
  const result = await listRegistries(parsed.data.module, parsed.data.page, parsed.data.pageSize, {
    q: parsed.data.q,
    statut: parsed.data.statut,
    agenceId: scopeFields.agenceId,
    agenceIds: scopeFields.agenceIds,
  });
  return NextResponse.json(
    {
      items: result.items.map((d) => ({
        id: d._id,
        reference: d.reference,
        titre: d.titre,
        concessionnaireId: d.concessionnaireId,
        agenceId: d.agenceId,
        statut: d.statut,
        commentaire: d.commentaire,
        meta: d.meta,
        createdAt: d.createdAt.toISOString(),
        updatedAt: d.updatedAt.toISOString(),
      })),
      total: result.total,
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
    },
    { status: 200 },
  );
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(request, {
    roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
  });
  if ("error" in auth) return auth.error;

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return zodBadRequest(parsed.error);
  }

  const agenceId = enforcedAgenceIdOnCreate(auth.user, parsed.data.agenceId ?? null);
  if (agenceId && !userMatchesAgence(auth.user, agenceId)) {
    return forbidden("Acces refuse pour cette agence.", "AGENCE_FORBIDDEN");
  }

  await ensureRegistryIndexes();
  const { resolveFormPartyIds } = await import("@/lib/lonaci/client-party-resolve");
  let registryConcessionnaireId: string | null = (parsed.data.concessionnaireId ?? null) as string | null;
  const clientId = (parsed.data.lonaciClientId ?? "").trim() || null;
  if (clientId) {
    const party = await resolveFormPartyIds({
      lonaciClientId: clientId,
      concessionnaireId: registryConcessionnaireId,
    });
    registryConcessionnaireId = party.concessionnaireId;
  }
  const created = await createRegistry({
    module: parsed.data.module,
    titre: parsed.data.titre,
    concessionnaireId: registryConcessionnaireId,
    agenceId,
    statut: parsed.data.statut,
    commentaire: parsed.data.commentaire ?? null,
    actorId: auth.user._id ?? "",
  });

  return NextResponse.json(
    {
      item: {
        id: created._id,
        reference: created.reference,
        titre: created.titre,
        statut: created.statut,
        createdAt: created.createdAt.toISOString(),
      },
    },
    { status: 201 },
  );
}
