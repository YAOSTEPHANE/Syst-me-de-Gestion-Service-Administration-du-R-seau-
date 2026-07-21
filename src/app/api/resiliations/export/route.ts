import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { listAgenceScopeFields, requireListAgenceScope } from "@/lib/api/list-agence-scope";
import { listResiliations, type ResiliationStatus } from "@/lib/lonaci/resiliations";
import { resiliationDisplayStatutFields } from "@/lib/lonaci/resiliation-statut-metier";
import { requireApiAuth } from "@/lib/auth/guards";
import { LONACI_ROLES } from "@/lib/lonaci/constants";
import { createPdfResponse } from "@/lib/pdf";
import { renderResiliationsListPdf } from "@/lib/pdf/resiliations-list";

const schema = z.object({
  format: z.enum(["csv", "pdf"]).default("csv"),
  statut: z
    .enum(["DOSSIER_RECU", "CONTROLE_CHEF_SECTION", "VALIDATION_N2", "RESILIE", "REJETEE"])
    .optional(),
  concessionnaireId: z.string().optional(),
  agenceId: z.string().optional(),
  produitCode: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, {
    roles: [...LONACI_ROLES],
  });
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json({ message: "Parametres invalides", issues: parsed.error.issues }, { status: 400 });
  }

  const dateFrom = parsed.data.dateFrom?.trim() ? new Date(parsed.data.dateFrom) : undefined;
  const dateTo = parsed.data.dateTo?.trim() ? new Date(parsed.data.dateTo) : undefined;
  const agenceScope = requireListAgenceScope(auth.user, parsed.data.agenceId);
  if (!agenceScope.ok) return agenceScope.response;
  const data = await listResiliations({
    page: 1,
    pageSize: 1000,
    actor: auth.user,
    ...listAgenceScopeFields(agenceScope),
    statut: parsed.data.statut as ResiliationStatus | undefined,
    concessionnaireId: parsed.data.concessionnaireId?.trim() || undefined,
    produitCode: parsed.data.produitCode?.trim() || undefined,
    dateFrom: dateFrom && !Number.isNaN(dateFrom.getTime()) ? dateFrom : undefined,
    dateTo: dateTo && !Number.isNaN(dateTo.getTime()) ? dateTo : undefined,
  });

  if (parsed.data.format === "csv") {
    const lines = [
      "id,concessionnaireId,produitCode,dateReception,statut,motif,commentaire,validatedAt",
      ...data.items.map((r) => {
        const display = resiliationDisplayStatutFields({
          statut: r.statut,
          checklistComplet: r.documentChecklist?.complet ?? null,
        });
        return [
          r.id,
          r.concessionnaireId,
          r.produitCode,
          r.dateReception,
          display.statutMetierLabel,
          `"${r.motif.replaceAll('"', '""')}"`,
          `"${(r.commentaire ?? "").replaceAll('"', '""')}"`,
          r.validatedAt ?? "",
        ].join(",");
      }),
    ];
    return new NextResponse(lines.join("\n"), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="resiliations-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  const issuedAt = new Date();
  const pdf = await renderResiliationsListPdf(
    data.items.map((row) => ({
      id: row.id,
      concessionnaireId: row.concessionnaireId,
      produitCode: row.produitCode,
      dateReception: row.dateReception,
      statutLabel: row.statutMetierLabel,
      motif: row.motif,
      commentaire: row.commentaire,
      validatedAt: row.validatedAt,
    })),
    issuedAt,
  );
  return createPdfResponse(pdf, {
    filename: `resiliations-${issuedAt.toISOString().slice(0, 10)}.pdf`,
  });
}

