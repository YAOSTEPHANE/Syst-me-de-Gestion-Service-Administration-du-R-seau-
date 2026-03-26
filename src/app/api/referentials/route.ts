import { NextRequest, NextResponse } from "next/server";

import { requireApiAuth } from "@/lib/auth/guards";
import { ensureReferentialsIndexes, listAgences, listProduits } from "@/lib/lonaci/referentials";

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, {
    roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
  });
  if ("error" in auth) {
    return auth.error;
  }

  await ensureReferentialsIndexes();
  const [agences, produits] = await Promise.all([listAgences(), listProduits()]);
  return NextResponse.json(
    {
      agences: agences.map((a) => ({
        id: a._id ?? "",
        code: a.code,
        libelle: a.libelle,
        actif: a.actif,
      })),
      produits: produits.map((p) => ({
        id: p._id ?? "",
        code: p.code,
        libelle: p.libelle,
        actif: p.actif,
      })),
    },
    { status: 200 },
  );
}
