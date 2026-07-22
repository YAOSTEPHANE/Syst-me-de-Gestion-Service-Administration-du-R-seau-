import type { NextRequest } from "next/server";

import { requireApiAuth } from "@/lib/auth/guards";
import { ensureReferentialsIndexes, listProduits } from "@/lib/lonaci/referentials";
import { createPdfResponse, renderAdminProduitsExportPdf } from "@/lib/pdf";

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, { roles: ["CHEF_SERVICE"] });
  if ("error" in auth) return auth.error;

  await ensureReferentialsIndexes();
  const produits = await listProduits();
  const generatedAt = new Date();
  const pdfBuffer = await renderAdminProduitsExportPdf(
    produits.map((row) => ({
      code: row.code,
      libelle: row.libelle,
      prix: typeof row.prix === "number" ? row.prix : 0,
      prixKit: typeof row.prixKit === "number" ? row.prixKit : 0,
      statut: row.actif ? "ACTIF" : "INACTIF",
      id: row._id ?? "",
    })),
    generatedAt,
  );

  return createPdfResponse(pdfBuffer, {
    filename: `produits-${generatedAt.getTime()}.pdf`,
  });
}
