import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { zodBadRequest } from "@/lib/api/endpoint-helpers";
import {
  buildCessionsExportFiltersSummary,
  renderCessionsListPdf,
} from "@/lib/lonaci/cessions-export";
import { ensureCessionIndexes, listCessionsForExport } from "@/lib/lonaci/cessions";
import { concessionnaireListScopeAgenceId } from "@/lib/lonaci/concessionnaires";
import { listAgences } from "@/lib/lonaci/referentials";
import { requireApiAuth } from "@/lib/auth/guards";

const schema = z.object({
  format: z.enum(["pdf"]).default("pdf"),
  kind: z.enum(["CESSION", "DELOCALISATION", "CESSION_DELOCALISATION"]).default("CESSION"),
  statut: z
    .enum(["SAISIE_AGENT", "CONTROLE_CHEF_SECTION", "VALIDATION_N2", "VALIDEE_CHEF_SERVICE", "REJETEE"])
    .optional(),
  produitCode: z.string().optional(),
  agenceId: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

function parseFilterDate(value: string | undefined, endOfDay: boolean): Date | undefined {
  if (!value?.trim()) return undefined;
  const d = new Date(value.trim());
  if (Number.isNaN(d.getTime())) return undefined;
  if (endOfDay) {
    d.setHours(23, 59, 59, 999);
  } else {
    d.setHours(0, 0, 0, 0);
  }
  return d;
}

/** Spec 5.3 — export PDF de la liste filtrée des demandes de cession. */
export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, {
    roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
  });
  if ("error" in auth) return auth.error;

  const parsed = schema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
  if (!parsed.success) {
    return zodBadRequest(parsed.error, "Parametres invalides");
  }

  await ensureCessionIndexes();

  const scopeAgenceId = concessionnaireListScopeAgenceId(auth.user);
  const requestedAgenceId = parsed.data.agenceId?.trim() || undefined;
  const agenceId = scopeAgenceId ?? requestedAgenceId;
  const dateFrom = parseFilterDate(parsed.data.dateFrom, false);
  const dateTo = parseFilterDate(parsed.data.dateTo, true);

  const kind = parsed.data.kind;
  const statut = parsed.data.statut;
  const produitCode = parsed.data.produitCode?.trim() || undefined;

  const { exportRows, truncated } = await listCessionsForExport({
    kind,
    statut,
    produitCode,
    agenceId,
    scopeAgenceId,
    dateFrom,
    dateTo,
  });

  const agences = await listAgences();
  const agenceLabel = agenceId
    ? agences.find((a) => a._id === agenceId)?.libelle ?? agenceId
    : undefined;

  const filtersSummary = buildCessionsExportFiltersSummary({
    kind,
    statut,
    produitCode,
    agenceLabel,
    dateFrom,
    dateTo,
  });

  const pdf = await renderCessionsListPdf(
    {
      generatedAt: new Date().toISOString(),
      filtersSummary: truncated ? `${filtersSummary} · (liste tronquée à 10 000 lignes)` : filtersSummary,
      total: exportRows.length,
      kind,
    },
    exportRows,
  );

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="cessions-liste-${stamp}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
