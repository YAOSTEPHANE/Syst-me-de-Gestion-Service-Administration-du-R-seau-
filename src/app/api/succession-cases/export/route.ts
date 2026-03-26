import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { listSuccessionCases } from "@/lib/lonaci/succession";
import { requireApiAuth } from "@/lib/auth/guards";

const schema = z.object({
  format: z.enum(["csv", "pdf"]).default("csv"),
  status: z.enum(["OUVERT", "CLOTURE"]).optional(),
  concessionnaireId: z.string().optional(),
  decisionType: z.enum(["TRANSFERT", "RESILIATION"]).optional(),
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

  const scope = auth.user.role === "CHEF_SERVICE" && auth.user.agenceId === null ? undefined : auth.user.agenceId;
  const data = await listSuccessionCases(1, 2000, scope, parsed.data.status, {
    concessionnaireId: parsed.data.concessionnaireId?.trim() || undefined,
    decisionType: parsed.data.decisionType,
    dateFrom:
      parsed.data.dateFrom && !Number.isNaN(new Date(parsed.data.dateFrom).getTime())
        ? new Date(parsed.data.dateFrom)
        : undefined,
    dateTo:
      parsed.data.dateTo && !Number.isNaN(new Date(parsed.data.dateTo).getTime())
        ? new Date(parsed.data.dateTo)
        : undefined,
  });

  if (parsed.data.format === "csv") {
    const lines = [
      "reference,concessionnaireId,status,stepsCompleted,stepsTotal,decisionType,autoDossierContratReference,updatedAt",
      ...data.items.map((r) =>
        [
          r.reference,
          r.concessionnaireId,
          r.status,
          r.stepsCompleted,
          r.stepsTotal,
          r.decisionType ?? "",
          r.autoDossierContratReference ?? "",
          r.updatedAt,
        ].join(","),
      ),
    ];
    return new NextResponse(lines.join("\n"), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="succession-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  const rows = data.items
    .map(
      (r) =>
        `<tr><td>${r.reference}</td><td>${r.concessionnaireId}</td><td>${r.status}</td><td>${r.stepsCompleted}/${r.stepsTotal}</td><td>${r.decisionType ?? ""}</td><td>${r.autoDossierContratReference ?? ""}</td><td>${new Date(r.updatedAt).toLocaleString("fr-FR")}</td></tr>`,
    )
    .join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"/><title>Décès & Succession</title></head><body><h1>Décès & Succession</h1><p>Export imprimable (PDF via impression navigateur)</p><table border="1" cellspacing="0" cellpadding="6"><thead><tr><th>Réf</th><th>Concessionnaire</th><th>Statut</th><th>Progression</th><th>Décision</th><th>Dossier contrat auto</th><th>MAJ</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `inline; filename="succession-${new Date().toISOString().slice(0, 10)}.html"`,
    },
  });
}
