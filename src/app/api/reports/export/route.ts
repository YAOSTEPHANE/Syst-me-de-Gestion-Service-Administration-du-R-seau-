import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireListAgenceScope } from "@/lib/api/list-agence-scope";
import { buildReportSummary, summaryToCsv, type ReportPeriod, type ReportSummary } from "@/lib/lonaci/reports";
import { requireApiAuth } from "@/lib/auth/guards";
import { LONACI_ROLES } from "@/lib/lonaci/constants";

const schema = z.object({
  period: z.enum(["daily", "weekly", "monthly"]).default("daily"),
  format: z.enum(["csv", "json", "xlsx"]).default("csv"),
  agenceId: z.string().optional(),
  compareAgences: z.enum(["0", "1"]).optional().default("0"),
  topAgences: z.coerce.number().int().min(1).max(50).optional().default(8),
});

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, {
    roles: [...LONACI_ROLES],
    rbac: { resource: "REPORTS", action: "READ" },
  });
  if ("error" in auth) return auth.error;

  const parsed = schema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json({ message: "Parametres invalides", issues: parsed.error.issues }, { status: 400 });
  }

  const agenceScope = requireListAgenceScope(auth.user, parsed.data.agenceId);
  if (!agenceScope.ok) return agenceScope.response;

  const summary = await buildReportSummary(
    parsed.data.period as ReportPeriod,
    agenceScope.agenceId,
    parsed.data.compareAgences === "1" ? parsed.data.topAgences : 0,
    agenceScope.agenceIds,
  );
  if (parsed.data.format === "json") {
    return NextResponse.json(summary, { status: 200 });
  }

  if (parsed.data.format === "xlsx") {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();

    const metaRows = buildMetaRows(summary);
    const modulesRows = buildModulesRows(summary);
    const statusRows = Object.entries(summary.dossiers.byStatus).map(([status, count]) => ({ status, count }));
    const agenceRows = summary.agenceComparatif?.map((row) => ({
      agenceCode: row.agenceCode,
      agenceLabel: row.agenceLabel,
      dossiersTotal: row.dossiersTotal,
      dossiersCreatedInWindow: row.dossiersCreatedInWindow,
      concessionnairesTotal: row.concessionnairesTotal,
      successionOuverts: row.successionOuverts,
      pdvNonFinalise: row.pdvNonFinalise,
    }));

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(metaRows), "meta");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(modulesRows), "modules");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(statusRows.length ? statusRows : [{ status: "N/A", count: 0 }]), "dossiers_status");
    if (agenceRows && agenceRows.length > 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(agenceRows), "agences_compare");
    }

    const xlsxArrayBuffer = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const filename = `lonaci-rapport-${parsed.data.period}-${new Date().toISOString().slice(0, 10)}.xlsx`;
    return new NextResponse(xlsxArrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  const csv = summaryToCsv(summary);
  const filename = `lonaci-rapport-${parsed.data.period}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

function buildMetaRows(summary: ReportSummary) {
  return [
    { key: "period", value: summary.period },
    { key: "windowLabel", value: summary.windowLabel },
    { key: "generatedAt", value: summary.generatedAt },
    { key: "windowFrom", value: summary.windowFrom },
    { key: "windowTo", value: summary.windowTo },
    { key: "agenceId", value: summary.agenceId ?? "" },
    { key: "dossiers_total", value: summary.dossiers.total },
    { key: "dossiers_created_in_window", value: summary.dossiers.createdInWindow },
  ];
}

function buildModulesRows(summary: ReportSummary) {
  return [
    {
      module: "CONTRATS",
      actifs: summary.modules.contrats.actifs,
      resilie: summary.modules.contrats.resilie,
      createdInWindow: summary.modules.contrats.createdInWindow,
    },
    {
      module: "CAUTIONS",
      enAttente: summary.modules.cautions.enAttente,
      alertesJ10: summary.modules.cautions.alertesJ10,
    },
    {
      module: "CONCESSIONNAIRES",
      total: summary.modules.concessionnaires.total,
    },
    {
      module: "DOSSIERS",
      total: summary.modules.dossiers.total,
      createdInWindow: summary.modules.dossiers.createdInWindow,
    },
    {
      module: "SUCCESSION",
      ouverts: summary.modules.succession.ouverts,
      stale30j: summary.modules.succession.stale30j,
    },
    {
      module: "PDV_INTEGRATIONS",
      nonFinalise: summary.modules.pdvIntegrations.nonFinalise,
    },
  ];
}
