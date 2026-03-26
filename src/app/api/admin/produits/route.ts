import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireApiAuth } from "@/lib/auth/guards";
import {
  createProduit,
  ensureReferentialsIndexes,
  listProduits,
} from "@/lib/lonaci/referentials";

const createProduitSchema = z.object({
  code: z.string().min(2),
  libelle: z.string().min(2),
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
    return NextResponse.json({ message: "Donnees invalides", issues: parsed.error.issues }, { status: 400 });
  }

  await ensureReferentialsIndexes();
  try {
    const produit = await createProduit(parsed.data);
    return NextResponse.json({ produit }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Impossible de creer le produit";
    if (message.includes("E11000")) {
      return NextResponse.json({ message: "Le code produit existe deja" }, { status: 409 });
    }
    return NextResponse.json({ message }, { status: 500 });
  }
}
