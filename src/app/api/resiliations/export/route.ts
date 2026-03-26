import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { listResiliations, type ResiliationStatus } from "@/lib/lonaci/resiliations";
import { requireApiAuth } from "@/lib/auth/guards";

const schema = z.object({
  format: z.enum(["csv", "pdf"]).default("csv"),
  statut: z.enum(["DOSSIER_RECU", "RESILIE"]).optional(),
  concessionnaireId: z.string().optional(),
  produitCode: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, {
    roles: ["CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
  });
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json({ message: "Parametres invalides", issues: parsed.error.issues }, { status: 400 });
  }

  const dateFrom = parsed.data.dateFrom?.trim() ? new Date(parsed.data.dateFrom) : undefined;
  const dateTo = parsed.data.dateTo?.trim() ? new Date(parsed.data.dateTo) : undefined;
  const data = await listResiliations({
    page: 1,
    pageSize: 1000,
    statut: parsed.data.statut as ResiliationStatus | undefined,
    concessionnaireId: parsed.data.concessionnaireId?.trim() || undefined,
    produitCode: parsed.data.produitCode?.trim() || undefined,
    dateFrom: dateFrom && !Number.isNaN(dateFrom.getTime()) ? dateFrom : undefined,
    dateTo: dateTo && !Number.isNaN(dateTo.getTime()) ? dateTo : undefined,
  });

  if (parsed.data.format === "csv") {
    const lines = [
      "id,concessionnaireId,produitCode,dateReception,statut,motif,commentaire,validatedAt",
      ...data.items.map((r) =>
        [
          r.id,
          r.concessionnaireId,
          r.produitCode,
          r.dateReception,
          r.statut,
          `"${r.motif.replaceAll('"', '""')}"`,
          `"${(r.commentaire ?? "").replaceAll('"', '""')}"`,
          r.validatedAt ?? "",
        ].join(","),
      ),
    ];
    return new NextResponse(lines.join("\n"), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="resiliations-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  const rows = data.items
    .map(
      (r) =>
        `<tr><td>${r.id}</td><td>${r.concessionnaireId}</td><td>${r.produitCode}</td><td>${new Date(r.dateReception).toLocaleString("fr-FR")}</td><td>${r.statut}</td><td>${r.motif}</td><td>${r.commentaire ?? ""}</td></tr>`,
    )
    .join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"/><title>Résiliations</title></head><body><h1>Résiliations</h1><p>Export imprimable (PDF via impression navigateur)</p><table border="1" cellspacing="0" cellpadding="6"><thead><tr><th>ID</th><th>Concessionnaire</th><th>Produit</th><th>Date réception</th><th>Statut</th><th>Motif</th><th>Commentaire</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `inline; filename="resiliations-${new Date().toISOString().slice(0, 10)}.html"`,
    },
  });
}

