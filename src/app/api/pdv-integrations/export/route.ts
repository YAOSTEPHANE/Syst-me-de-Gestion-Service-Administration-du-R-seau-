import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireListAgenceScope, listAgenceScopeFields } from "@/lib/api/list-agence-scope";
import { requireApiAuth } from "@/lib/auth/guards";
import { ensureSprint4Indexes, listPdvIntegrations } from "@/lib/lonaci/sprint4";
import { LONACI_ROLES, PDV_INTEGRATION_STATUSES } from "@/lib/lonaci/constants";
import { createPdfResponse, renderPdvIntegrationsExportPdf } from "@/lib/pdf";

const querySchema = z.object({
  format: z.enum(["excel", "pdf"]).default("excel"),
  agenceId: z.string().optional(),
  produitCode: z.string().optional(),
  status: z.enum(PDV_INTEGRATION_STATUSES).optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
});

function escapeCell(v: string) {
  return `"${v.replace(/"/g, '""')}"`;
}

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, {
    roles: [...LONACI_ROLES],
    rbac: { resource: "PDV_INTEGRATIONS", action: "READ" },
  });
  if ("error" in auth) return auth.error;
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json({ message: "Parametres invalides", issues: parsed.error.issues }, { status: 400 });
  }
  await ensureSprint4Indexes();
  const agenceScope = requireListAgenceScope(auth.user, parsed.data.agenceId);
  if (!agenceScope.ok) return agenceScope.response;
  const result = await listPdvIntegrations({
    page: 1,
    pageSize: 20000,
    ...listAgenceScopeFields(agenceScope),
    produitCode: parsed.data.produitCode?.trim() || undefined,
    status: parsed.data.status,
    dateFrom: parsed.data.dateFrom ? new Date(parsed.data.dateFrom) : undefined,
    dateTo: parsed.data.dateTo ? new Date(parsed.data.dateTo) : undefined,
  });

  if (parsed.data.format === "excel") {
    const header = [
      "Reference",
      "Code PDV",
      "Agence",
      "Produit",
      "Nombre demandes",
      "Date demande",
      "Statut",
      "Latitude",
      "Longitude",
      "Observations",
    ];
    const lines = result.items.map((r) =>
      [
        r.reference,
        r.codePdv,
        r.agenceId ?? "",
        r.produitCode,
        String(r.nombreDemandes),
        r.dateDemande,
        r.status,
        String(r.gps.lat),
        String(r.gps.lng),
        r.observations ?? "",
      ]
        .map((x) => escapeCell(x))
        .join(","),
    );
    const csv = `\uFEFF${header.map(escapeCell).join(",")}\n${lines.join("\n")}`;
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="pdv-integrations-${Date.now()}.csv"`,
      },
    });
  }

  const generatedAt = new Date();
  const filters = [
    parsed.data.agenceId ? `Agence : ${parsed.data.agenceId}` : undefined,
    parsed.data.produitCode ? `Produit : ${parsed.data.produitCode}` : undefined,
    parsed.data.status ? `Statut : ${parsed.data.status}` : undefined,
    parsed.data.dateFrom ? `Depuis : ${new Date(parsed.data.dateFrom).toLocaleDateString("fr-FR")}` : undefined,
    parsed.data.dateTo ? `Jusqu’au : ${new Date(parsed.data.dateTo).toLocaleDateString("fr-FR")}` : undefined,
  ].filter((value): value is string => Boolean(value));
  const pdfBuffer = await renderPdvIntegrationsExportPdf(result.items, {
    generatedAt,
    filters,
  });

  return createPdfResponse(pdfBuffer, {
    filename: `pdv-integrations-${generatedAt.getTime()}`,
  });
}

