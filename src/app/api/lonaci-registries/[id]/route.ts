import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { ensureRegistryIndexes, softDeleteRegistry, updateRegistry } from "@/lib/lonaci/lonaci-registries";
import { requireApiAuth } from "@/lib/auth/guards";

const patchSchema = z.object({
  statut: z.string().min(1).max(64).optional(),
  commentaire: z.union([z.string().max(10000), z.null()]).optional(),
  titre: z.string().min(2).max(500).optional(),
});

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
    return NextResponse.json({ message: "Donnees invalides", issues: parsed.error.issues }, { status: 400 });
  }

  await ensureRegistryIndexes();
  const updated = await updateRegistry(id, {
    ...parsed.data,
    actorId: auth.user._id ?? "",
  });
  if (!updated) {
    return NextResponse.json({ message: "Entree introuvable" }, { status: 404 });
  }

  return NextResponse.json(
    {
      item: {
        id: updated._id,
        reference: updated.reference,
        titre: updated.titre,
        statut: updated.statut,
        commentaire: updated.commentaire,
        updatedAt: updated.updatedAt.toISOString(),
      },
    },
    { status: 200 },
  );
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth(request, {
    roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
  });
  if ("error" in auth) return auth.error;

  const { id } = await context.params;
  await ensureRegistryIndexes();
  const deleted = await softDeleteRegistry(id, auth.user._id ?? "");
  if (!deleted) {
    return NextResponse.json({ message: "Entree introuvable" }, { status: 404 });
  }
  return NextResponse.json({ ok: true }, { status: 200 });
}
