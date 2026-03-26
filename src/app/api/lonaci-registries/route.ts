import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createRegistry, ensureRegistryIndexes, listRegistries } from "@/lib/lonaci/lonaci-registries";
import { requireApiAuth } from "@/lib/auth/guards";

const moduleEnum = z.enum(["AGREMENT", "CESSION", "GPR"]);

const listSchema = z.object({
  module: moduleEnum,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const createSchema = z.object({
  module: moduleEnum,
  titre: z.string().min(2).max(500),
  concessionnaireId: z.union([z.string().min(1), z.null()]).optional(),
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
    return NextResponse.json({ message: "Parametres invalides", issues: parsed.error.issues }, { status: 400 });
  }

  await ensureRegistryIndexes();
  const result = await listRegistries(parsed.data.module, parsed.data.page, parsed.data.pageSize);
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
    return NextResponse.json({ message: "Donnees invalides", issues: parsed.error.issues }, { status: 400 });
  }

  await ensureRegistryIndexes();
  const created = await createRegistry({
    module: parsed.data.module,
    titre: parsed.data.titre,
    concessionnaireId: parsed.data.concessionnaireId ?? null,
    agenceId: parsed.data.agenceId ?? null,
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
