import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireListAgenceScope, listAgenceScopeFields } from "@/lib/api/list-agence-scope";
import { requireApiAuth } from "@/lib/auth/guards";
import { listUnifiedAuditLogs } from "@/lib/lonaci/audit-logs";
import { getDossierValidationSnapshot } from "@/lib/lonaci/dashboard-stats";
import { buildReportSummary } from "@/lib/lonaci/reports";
import { ensureSuccessionIndexes, listSuccessionStaleAlerts } from "@/lib/lonaci/succession";
import { listCautionAlertsJ10 } from "@/lib/lonaci/sprint4";
import { createPdfResponse, renderSupervisionExportPdf } from "@/lib/pdf";

const querySchema = z.object({
  format: z.enum(["pdf", "csv", "xlsx"]).default("pdf"),
  source: z.enum(["AUTH", "MONITORING"]).optional(),
  status: z.enum(["SUCCESS", "FAILED", "OPEN", "ACK"]).optional(),
  agenceId: z.string().optional(),
  slaStatus: z.enum(["ALL", "OVERDUE"]).default("ALL"),
  query: z.string().trim().min(1).max(200).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

function csvEscape(value: string | number | null | undefined): string {
  const raw = value == null ? "" : String(value);
  return `"${raw.replace(/"/g, '""')}"`;
}

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, { roles: ["CHEF_SERVICE"] });
  if ("error" in auth) return auth.error;

  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json({ message: "Parametres invalides", issues: parsed.error.issues }, { status: 400 });
  }

  await ensureSuccessionIndexes();
  const agenceScope = requireListAgenceScope(auth.user, parsed.data.agenceId);
  if (!agenceScope.ok) return agenceScope.response;
  const scopeFields = listAgenceScopeFields(agenceScope);

  const [daily, cautionAlerts, successionStale, auditLogs] = await Promise.all([
    buildReportSummary("daily", scopeFields.agenceId ?? scopeFields.scopeAgenceId, 0, scopeFields.agenceIds ?? scopeFields.scopeAgenceIds),
    listCautionAlertsJ10(scopeFields.scopeAgenceId ?? scopeFields.agenceId),
    listSuccessionStaleAlerts(scopeFields.scopeAgenceId ?? scopeFields.agenceId, scopeFields.scopeAgenceIds ?? scopeFields.agenceIds),
    listUnifiedAuditLogs({
      page: 1,
      pageSize: 500,
      source: parsed.data.source,
      status: parsed.data.status,
      query: parsed.data.query,
      from: parsed.data.from ? new Date(parsed.data.from) : undefined,
      to: parsed.data.to ? new Date(parsed.data.to) : undefined,
    }),
  ]);

  const scopeAgenceId = scopeFields.scopeAgenceId ?? scopeFields.agenceId ?? null;

  const dossierValidation = await getDossierValidationSnapshot(
    cautionAlerts.length,
    daily.succession.ouverts,
    successionStale.length,
    daily.pdvIntegrations.nonFinalise,
    scopeAgenceId,
  );

  const rawSlaRows = [
    { module: "CONTRATS", pending: dossierValidation.contratSoumis, overdue: dossierValidation.contratSoumisRetard48h },
    { module: "CAUTIONS", pending: dossierValidation.cautionsEnAttente, overdue: dossierValidation.cautionsJ10 },
    { module: "PDV_INTEGRATIONS", pending: dossierValidation.pdvNonFinalise, overdue: dossierValidation.pdvEnCoursRetard5j },
    { module: "AGREMENTS", pending: dossierValidation.agrementsEnAttente, overdue: dossierValidation.agrementsRetard },
    { module: "SUCCESSIONS", pending: dossierValidation.successionOuverts, overdue: dossierValidation.successionStale30j },
  ];
  const slaRows = parsed.data.slaStatus === "OVERDUE" ? rawSlaRows.filter((row) => row.overdue > 0) : rawSlaRows;

  if (parsed.data.format === "csv") {
    const header = ["date", "source", "status", "code", "title", "message", "actor", "targetRole"];
    const lines = auditLogs.items.map((row) =>
      [new Date(row.timestamp).toISOString(), row.source, row.status, row.code ?? "", row.title, row.message, row.actor ?? "", row.targetRole ?? ""]
        .map(csvEscape)
        .join(","),
    );
    const slaHeader = ["module", "pending", "overdue"];
    const slaLines = slaRows.map((row) => [row.module, row.pending, row.overdue].map(csvEscape).join(","));
    const body = [
      "\uFEFF\"section\",\"name\",\"value\"",
      `"meta","generatedAt",${csvEscape(new Date().toISOString())}`,
      "",
      slaHeader.map(csvEscape).join(","),
      ...slaLines,
      "",
      header.map(csvEscape).join(","),
      ...lines,
    ].join("\n");
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="supervision-export-${Date.now()}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }

  if (parsed.data.format === "xlsx") {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet([
        {
          generatedAt: new Date().toISOString(),
          source: parsed.data.source ?? "ALL",
          status: parsed.data.status ?? "ALL",
          agenceId: scopeAgenceId ?? (scopeFields.scopeAgenceIds?.length ? scopeFields.scopeAgenceIds.join(",") : "ALL"),
          slaStatus: parsed.data.slaStatus,
          query: parsed.data.query ?? "",
        },
      ]),
      "meta",
    );
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(slaRows), "sla");
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        auditLogs.items.map((row) => ({
          timestamp: row.timestamp,
          source: row.source,
          status: row.status,
          code: row.code ?? "",
          title: row.title,
          message: row.message,
          actor: row.actor ?? "",
          targetRole: row.targetRole ?? "",
        })),
      ),
      "audit_logs",
    );
    const xlsxArrayBuffer = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    return new NextResponse(xlsxArrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="supervision-export-${Date.now()}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const generatedAt = new Date();
  const agenceLabel =
    scopeAgenceId ??
    (scopeFields.scopeAgenceIds?.length ? scopeFields.scopeAgenceIds.join(", ") : "Toutes");
  const pdfBuffer = await renderSupervisionExportPdf({
    generatedAt,
    filters: {
      source: parsed.data.source,
      status: parsed.data.status,
      agence: agenceLabel,
      slaStatus: parsed.data.slaStatus,
      query: parsed.data.query,
      from: parsed.data.from,
      to: parsed.data.to,
    },
    slaRows,
    auditLogs: auditLogs.items,
    auditTotal: auditLogs.total,
    auditLimit: 500,
  });

  return createPdfResponse(pdfBuffer, {
    filename: `supervision-export-${generatedAt.getTime()}`,
  });
}
