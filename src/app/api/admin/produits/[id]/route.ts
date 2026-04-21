import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { zodBadRequest } from "@/lib/api/endpoint-helpers";
import { countProduitReferences } from "@/lib/lonaci/produit-usage";
import {
  deleteProduitById,
  ensureReferentialsIndexes,
  findProduitById,
  updateProduit,
} from "@/lib/lonaci/referentials";
import { requireApiAuth } from "@/lib/auth/guards";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const patchSchema = z
  .object({
    libelle: z.string().min(2).max(200).optional(),
    prix: z.coerce.number().int().min(0).max(999_999_999_999).optional(),
    actif: z.boolean().optional(),
    code: z.string().min(2).max(32).optional(),
  })
  .refine(
    (o) =>
      o.libelle !== undefined || o.prix !== undefined || o.actif !== undefined || o.code !== undefined,
    { message: "Au moins un champ est requis" },
  );

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth(request, { roles: ["CHEF_SERVICE"] });
  if ("error" in auth) {
    return auth.error;
  }

  const { id } = await context.params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return zodBadRequest(parsed.error);
  }

  await ensureReferentialsIndexes();
  const existing = await findProduitById(id);
  if (!existing) {
    return NextResponse.json({ message: "Produit introuvable" }, { status: 404 });
  }

  if (parsed.data.code !== undefined) {
    const nextCode = parsed.data.code.trim().toUpperCase();
    if (nextCode !== existing.code) {
      const refs = await countProduitReferences(existing.code);
      if (refs > 0) {
        return NextResponse.json(
          {
            message:
              "Impossible de modifier le code : des contrats, dossiers ou autres enregistrements utilisent encore ce code.",
          },
          { status: 409 },
        );
      }
    }
  }

  try {
    const produit = await updateProduit(id, parsed.data);
    if (!produit) {
      return NextResponse.json({ message: "Produit introuvable" }, { status: 404 });
    }
    return NextResponse.json({ produit }, { status: 200 });
  } catch (error) {
    if (error instanceof Error && error.message === "DUPLICATE_CODE") {
      return NextResponse.json({ message: "Ce code produit existe deja" }, { status: 409 });
    }
    const message = error instanceof Error ? error.message : "Mise a jour impossible";
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth(request, { roles: ["CHEF_SERVICE"] });
  if ("error" in auth) {
    return auth.error;
  }

  const { id } = await context.params;
  await ensureReferentialsIndexes();
  const existing = await findProduitById(id);
  if (!existing) {
    return NextResponse.json({ message: "Produit introuvable" }, { status: 404 });
  }

  const refs = await countProduitReferences(existing.code);
  if (refs > 0) {
    const produit = await updateProduit(id, { actif: false });
    if (!produit) {
      return NextResponse.json({ message: "Produit introuvable" }, { status: 404 });
    }
    return NextResponse.json(
      {
        produit,
        deactivated: true,
        message:
          "Des donnees sont encore liees a ce code : le produit a ete desactive au lieu d'etre supprime.",
      },
      { status: 200 },
    );
  }

  const deleted = await deleteProduitById(id);
  if (!deleted) {
    return NextResponse.json({ message: "Produit introuvable" }, { status: 404 });
  }
  return NextResponse.json({ deleted: true }, { status: 200 });
}
