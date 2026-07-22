import { NextRequest, NextResponse } from "next/server";

import { requireApiAuth } from "@/lib/auth/guards";
import { GRATTAGE_API_ROLES } from "@/lib/lonaci/grattage-access";
import { ensureReferentialsIndexes, listAgences, listProduits } from "@/lib/lonaci/referentials";

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, {
    roles: [...GRATTAGE_API_ROLES, "SUPERVISEUR_REGIONAL", "AUDITEUR", "LECTURE_SEULE"],
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
        zoneGeographique: a.zoneGeographique,
      })),
      produits: produits.map((p) => ({
        id: p._id ?? "",
        code: p.code,
        libelle: p.libelle,
        actif: p.actif,
        ...(typeof p.prix === "number" && Number.isFinite(p.prix) ? { prix: p.prix } : {}),
        ...(typeof p.prixKit === "number" && Number.isFinite(p.prixKit) ? { prixKit: p.prixKit } : {}),
        documentsChecklist: (p.documentsChecklist ?? []).map((item) => ({
          id: item.id,
          libelle: item.libelle,
          obligatoire: item.obligatoire !== false,
        })),
      })),
    },
    { status: 200 },
  );
}
