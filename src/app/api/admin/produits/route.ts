import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { zodBadRequest } from "@/lib/api/endpoint-helpers";
import { requireApiAuth } from "@/lib/auth/guards";
import {
  createProduit,
  ensureReferentialsIndexes,
  listProduits,
} from "@/lib/lonaci/referentials";
import { normalizeChecklistTemplate } from "@/lib/lonaci/produit-document-checklist";

const checklistItemSchema = z.object({
  id: z.string().min(1).max(64).optional(),
  libelle: z.string().min(2).max(200),
  obligatoire: z.boolean().optional(),
});

const createProduitSchema = z.object({
  code: z.string().min(2),
  libelle: z.string().min(2),
  /** Prix caution en FCFA (entier ≥ 0). */
  prix: z.coerce.number().int().min(0).max(999_999_999_999),
  documentsChecklist: z.array(checklistItemSchema).max(50).optional(),
  documentsAnnexe: z.array(checklistItemSchema).max(50).optional(),
});

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, { roles: ["CHEF_SERVICE"] });
  if ("error" in auth) {
    return auth.error;
  }

  await ensureReferentialsIndexes();
  const produits = await listProduits();
  return NextResponse.json({ produits }, { status: 200 });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(request, { roles: ["CHEF_SERVICE"] });
  if ("error" in auth) {
    return auth.error;
  }

  const parsed = createProduitSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return zodBadRequest(parsed.error);
  }

  await ensureReferentialsIndexes();
  try {
    const produit = await createProduit({
      ...parsed.data,
      documentsChecklist:
        parsed.data.documentsChecklist !== undefined
          ? normalizeChecklistTemplate(parsed.data.documentsChecklist)
          : undefined,
      documentsAnnexe:
        parsed.data.documentsAnnexe !== undefined
          ? normalizeChecklistTemplate(parsed.data.documentsAnnexe)
          : undefined,
    });
    return NextResponse.json({ produit }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Impossible de creer le produit";
    if (message.includes("E11000")) {
      return NextResponse.json({ message: "Le code produit existe deja" }, { status: 409 });
    }
    return NextResponse.json({ message }, { status: 500 });
  }
}
