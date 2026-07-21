import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { ensureAgrementsIndexes, listAgrements } from "@/lib/lonaci/agrements";
import { requireListAgenceScope, listAgenceScopeFields } from "@/lib/api/list-agence-scope";
import { requireApiAuth } from "@/lib/auth/guards";
import { LONACI_ROLES } from "@/lib/lonaci/constants";
import { createPdfResponse, renderAgrementsExportPdf } from "@/lib/pdf";

const schema = z.object({
  format: z.enum(["excel", "pdf"]).default("excel"),
  agenceId: z.string().optional(),
  produitCode: z.string().optional(),
  statut: z.enum(["RECU", "CONTROLE", "TRANSMIS", "FINALISE"]).optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
});

function escapeCell(v: string) {
  return `"${v.replace(/"/g, '""')}"`;
}

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, {
    roles: [...LONACI_ROLES],
    rbac: { resource: "AGREMENTS", action: "READ" },
  });
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json({ message: "Parametres invalides", issues: parsed.error.issues }, { status: 400 });
  }
  await ensureAgrementsIndexes();
  const agenceScope = requireListAgenceScope(auth.user, parsed.data.agenceId);
  if (!agenceScope.ok) return agenceScope.response;
  const result = await listAgrements({
    page: 1,
    pageSize: 20000,
    actor: auth.user,
    ...listAgenceScopeFields(agenceScope),
    produitCode: parsed.data.produitCode?.trim() || undefined,
    statut: parsed.data.statut,
    dateFrom: parsed.data.dateFrom ? new Date(parsed.data.dateFrom) : undefined,
    dateTo: parsed.data.dateTo ? new Date(parsed.data.dateTo) : undefined,
  });

  if (parsed.data.format === "excel") {
    const header = ["Reference", "Produit", "Date reception", "Ref officielle", "Agence", "Statut", "Observations"];
    const lines = result.items.map((r) =>
      [r.reference, r.produitCode, r.dateReception, r.referenceOfficielle, r.agenceId ?? "", r.statut, r.observations ?? ""]
        .map((x) => escapeCell(String(x)))
        .join(","),
    );
    const csv = `\uFEFF${header.map(escapeCell).join(",")}\n${lines.join("\n")}`;
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="agrements-${Date.now()}.csv"`,
      },
    });
  }

  const generatedAt = new Date();
  const filters = [
    parsed.data.agenceId ? `Agence : ${parsed.data.agenceId}` : undefined,
    parsed.data.produitCode ? `Produit : ${parsed.data.produitCode}` : undefined,
    parsed.data.statut ? `Statut : ${parsed.data.statut}` : undefined,
    parsed.data.dateFrom ? `Depuis : ${new Date(parsed.data.dateFrom).toLocaleDateString("fr-FR")}` : undefined,
    parsed.data.dateTo ? `Jusqu’au : ${new Date(parsed.data.dateTo).toLocaleDateString("fr-FR")}` : undefined,
  ].filter((value): value is string => Boolean(value));
  const pdfBuffer = await renderAgrementsExportPdf(result.items, { generatedAt, filters });
  return createPdfResponse(pdfBuffer, {
    filename: `agrements-${generatedAt.getTime()}`,
  });
}

