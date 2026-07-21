import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireListAgenceScope, listAgenceScopeFields } from "@/lib/api/list-agence-scope";
import { BANCARISATION_STATUTS, CONCESSIONNAIRE_STATUTS, LONACI_ROLES } from "@/lib/lonaci/constants";
import { ensureConcessionnaireIndexes, searchConcessionnaires } from "@/lib/lonaci/concessionnaires";
import { requireApiAuth } from "@/lib/auth/guards";
import { createPdfResponse, renderConcessionnairesExportPdf } from "@/lib/pdf";

const querySchema = z.object({
  format: z.enum(["excel", "pdf"]).default("excel"),
  q: z.string().optional(),
  statut: z.enum(CONCESSIONNAIRE_STATUTS).optional(),
  statutBancarisation: z.enum(BANCARISATION_STATUTS).optional(),
  agenceId: z.string().optional(),
  produitCode: z.string().optional(),
});

function toCsv(rows: Awaited<ReturnType<typeof searchConcessionnaires>>["items"]) {
  const header = [
    "Code PDV",
    "Code terminal",
    "Code concessionnaire",
    "Nom complet",
    "CNI",
    "Telephone principal",
    "Telephone secondaire",
    "Agence ID",
    "Produits",
    "Statut",
    "Bancarisation",
    "Ville",
    "Latitude",
    "Longitude",
  ];
  const escapeCell = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = rows.map((r) =>
    [
      r.codePdv ?? "",
      r.codeTerminal ?? "",
      r.codeConcessionnaire ?? "",
      r.nomComplet || r.raisonSociale,
      r.cniNumero ?? "",
      r.telephonePrincipal ?? "",
      r.telephoneSecondaire ?? "",
      r.agenceId ?? "",
      r.produitsAutorises.join("|"),
      r.statut,
      r.statutBancarisation,
      r.ville ?? "",
      r.gps ? String(r.gps.lat) : "",
      r.gps ? String(r.gps.lng) : "",
    ]
      .map((x) => escapeCell(x))
      .join(","),
  );
  return `\uFEFF${header.map(escapeCell).join(",")}\n${lines.join("\n")}`;
}

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, {
    roles: [...LONACI_ROLES],
    rbac: { resource: "CONCESSIONNAIRES", action: "READ" },
  });
  if ("error" in auth) return auth.error;

  const raw = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = querySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ message: "Parametres invalides", issues: parsed.error.issues }, { status: 400 });
  }

  await ensureConcessionnaireIndexes();
  const agenceScope = requireListAgenceScope(auth.user, parsed.data.agenceId);
  if (!agenceScope.ok) return agenceScope.response;
  const result = await searchConcessionnaires({
    page: 1,
    pageSize: 5000,
    q: parsed.data.q,
    statut: parsed.data.statut,
    statutBancarisation: parsed.data.statutBancarisation,
    produitCode: parsed.data.produitCode,
    ...listAgenceScopeFields(agenceScope),
    includeDeleted: false,
  });

  if (parsed.data.format === "excel") {
    const csv = toCsv(result.items);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="concessionnaires-${Date.now()}.csv"`,
      },
    });
  }

  const generatedAt = new Date();
  const filters = [
    parsed.data.q ? `Recherche : ${parsed.data.q}` : undefined,
    parsed.data.agenceId ? `Agence : ${parsed.data.agenceId}` : undefined,
    parsed.data.produitCode ? `Produit : ${parsed.data.produitCode}` : undefined,
    parsed.data.statut ? `Statut : ${parsed.data.statut}` : undefined,
    parsed.data.statutBancarisation
      ? `Bancarisation : ${parsed.data.statutBancarisation}`
      : undefined,
  ].filter((value): value is string => Boolean(value));
  const pdf = await renderConcessionnairesExportPdf(
    result.items.map((row) => ({
      codePdv: row.codePdv,
      codeTerminal: row.codeTerminal,
      codeConcessionnaire: row.codeConcessionnaire,
      nom: row.nomComplet || row.raisonSociale,
      cniNumero: row.cniNumero,
      telephonePrincipal: row.telephonePrincipal,
      agenceId: row.agenceId,
      statut: row.statut,
    })),
    { generatedAt, filters },
  );
  return createPdfResponse(pdf, {
    filename: `concessionnaires-${generatedAt.getTime()}`,
  });
}

