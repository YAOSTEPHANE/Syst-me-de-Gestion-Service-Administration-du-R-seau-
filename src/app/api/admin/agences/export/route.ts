import type { NextRequest } from "next/server";

import { requireApiAuth } from "@/lib/auth/guards";
import { ensureReferentialsIndexes, listAgences } from "@/lib/lonaci/referentials";
import { createPdfResponse, renderAdminAgencesExportPdf } from "@/lib/pdf";

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, { roles: ["CHEF_SERVICE"] });
  if ("error" in auth) return auth.error;

  await ensureReferentialsIndexes();
  const agences = await listAgences();
  const generatedAt = new Date();
  const pdfBuffer = await renderAdminAgencesExportPdf(
    agences.map((row) => ({
      code: row.code,
      libelle: row.libelle,
      zone: row.zoneGeographique === "ABIDJAN" ? "Abidjan" : "Intérieur",
      statut: row.actif ? "ACTIF" : "INACTIF",
      id: row._id ?? "",
    })),
    generatedAt,
  );

  return createPdfResponse(pdfBuffer, {
    filename: `agences-${generatedAt.getTime()}.pdf`,
  });
}
