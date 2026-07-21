import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireListAgenceScope, listAgenceScopeFields } from "@/lib/api/list-agence-scope";
import { BANCARISATION_STATUTS, LONACI_ROLES } from "@/lib/lonaci/constants";
import { listBancarisationRequests } from "@/lib/lonaci/bancarisation";
import { searchConcessionnaires } from "@/lib/lonaci/concessionnaires";
import { requireApiAuth } from "@/lib/auth/guards";
import { createPdfResponse, renderBancarisationExportPdf } from "@/lib/pdf";

const querySchema = z.object({
  format: z.enum(["excel", "pdf"]).default("excel"),
  statutBancarisation: z.enum(BANCARISATION_STATUTS).optional(),
  agenceId: z.string().optional(),
  produitCode: z.string().optional(),
});

function toCsv(rows: Awaited<ReturnType<typeof searchConcessionnaires>>["items"]) {
  const header = ["Code PDV", "Nom", "Statut bancarisation", "Compte", "Banque", "Agence", "Produits"];
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const body = rows.map((r) =>
    [
      r.codePdv ?? "",
      r.nomComplet || r.raisonSociale,
      r.statutBancarisation,
      r.compteBancaire ?? "",
      r.banqueEtablissement ?? "",
      r.agenceId ?? "",
      r.produitsAutorises.join("|"),
    ]
      .map(esc)
      .join(","),
  );
  return `\uFEFF${header.map(esc).join(",")}\n${body.join("\n")}`;
}

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, { roles: [...LONACI_ROLES] });
  if ("error" in auth) return auth.error;

  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json({ message: "Parametres invalides", issues: parsed.error.issues }, { status: 400 });
  }

  const agenceScope = requireListAgenceScope(auth.user, parsed.data.agenceId);
  if (!agenceScope.ok) return agenceScope.response;

  const scopeFields = listAgenceScopeFields(agenceScope);
  const [result, requests] = await Promise.all([
    searchConcessionnaires({
      page: 1,
      pageSize: 5000,
      statutBancarisation: parsed.data.statutBancarisation,
      produitCode: parsed.data.produitCode,
      ...scopeFields,
      includeDeleted: false,
    }),
    listBancarisationRequests({
      page: 1,
      pageSize: 10_000,
      statut: parsed.data.statutBancarisation,
      scopeAgenceId: scopeFields.scopeAgenceId,
      scopeAgenceIds: scopeFields.scopeAgenceIds,
      visibility: auth.user,
    }),
  ]);
  const visibleConcessionnaireIds = new Set(
    requests.items.map((item) => item.concessionnaireId),
  );
  const rows = result.items.filter((item) =>
    visibleConcessionnaireIds.has(item._id ?? ""),
  );

  if (parsed.data.format === "excel") {
    const csv = toCsv(rows);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="bancarisation-${Date.now()}.csv"`,
      },
    });
  }
  const generatedAt = new Date();
  const filters = [
    parsed.data.agenceId ? `Agence : ${parsed.data.agenceId}` : undefined,
    parsed.data.produitCode ? `Produit : ${parsed.data.produitCode}` : undefined,
    parsed.data.statutBancarisation
      ? `Statut : ${parsed.data.statutBancarisation}`
      : undefined,
  ].filter((value): value is string => Boolean(value));
  const pdf = await renderBancarisationExportPdf(
    rows.map((row) => ({
      codePdv: row.codePdv,
      nom: row.nomComplet || row.raisonSociale,
      statutBancarisation: row.statutBancarisation,
      compteBancaire: row.compteBancaire,
      banqueEtablissement: row.banqueEtablissement,
      agenceId: row.agenceId,
      produitsAutorises: row.produitsAutorises,
    })),
    { generatedAt, filters },
  );
  return createPdfResponse(pdf, {
    filename: `bancarisation-${generatedAt.getTime()}`,
  });
}
