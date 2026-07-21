import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  ensureAttestationsDomiciliationIndexes,
  listDemandesAttestationsDomiciliation,
} from "@/lib/lonaci/attestations-domiciliation";
import { requireListAgenceScope, listAgenceScopeFields } from "@/lib/api/list-agence-scope";
import { requireApiAuth } from "@/lib/auth/guards";
import { getAttestationDomiciliationStatutLabel, LONACI_ROLES } from "@/lib/lonaci/constants";
import { createPdfResponse, renderAttestationsDomiciliationExportPdf } from "@/lib/pdf";

const schema = z.object({
  format: z.enum(["excel", "pdf"]).default("excel"),
  type: z.enum(["ATTESTATION_REVENU", "DOMICILIATION_PRODUIT"]).optional(),
  concessionnaireId: z.string().optional(),
  produitCode: z.string().optional(),
  statut: z.enum(["DEMANDE_RECUE", "TRANSMIS", "FINALISE", "VALIDE", "ENVOYE_CLIENT"]).optional(),
  agenceId: z.string().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
});

function escapeCell(v: string) {
  return `"${v.replace(/"/g, '""')}"`;
}

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, { roles: [...LONACI_ROLES] });
  if ("error" in auth) return auth.error;

  const parsed = schema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json({ message: "Parametres invalides", issues: parsed.error.issues }, { status: 400 });
  }

  await ensureAttestationsDomiciliationIndexes();
  const agenceScope = requireListAgenceScope(auth.user, parsed.data.agenceId);
  if (!agenceScope.ok) return agenceScope.response;

  const result = await listDemandesAttestationsDomiciliation({
    page: 1,
    pageSize: 20000,
    type: parsed.data.type,
    concessionnaireId: parsed.data.concessionnaireId?.trim() || undefined,
    produitCode: parsed.data.produitCode?.trim() || undefined,
    statut: parsed.data.statut,
    ...listAgenceScopeFields(agenceScope),
    dateFrom: parsed.data.dateFrom ? new Date(parsed.data.dateFrom) : undefined,
    dateTo: parsed.data.dateTo ? new Date(parsed.data.dateTo) : undefined,
  });

  if (parsed.data.format === "excel") {
    const header = [
      "Type",
      "ConcessionnaireId",
      "Produit",
      "Date demande",
      "Statut",
      "Delai client (j)",
      "Observations",
    ];
    const lines = result.items.map((r) =>
      [
        r.type,
        r.concessionnaireId ?? "",
        r.produitCode ?? "",
        r.dateDemande,
        getAttestationDomiciliationStatutLabel(r.statut),
        r.delaiTraitementClientJours != null ? String(r.delaiTraitementClientJours) : "",
        r.observations ?? "",
      ]
        .map((x) => escapeCell(String(x)))
        .join(","),
    );
    const csv = `\uFEFF${header.map(escapeCell).join(",")}\n${lines.join("\n")}`;
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="attestations-domiciliation-${Date.now()}.csv"`,
      },
    });
  }

  const generatedAt = new Date();
  const filters = [
    parsed.data.type ? `Type : ${parsed.data.type}` : undefined,
    parsed.data.concessionnaireId
      ? `Concessionnaire : ${parsed.data.concessionnaireId}`
      : undefined,
    parsed.data.produitCode ? `Produit : ${parsed.data.produitCode}` : undefined,
    parsed.data.statut
      ? `Statut : ${getAttestationDomiciliationStatutLabel(parsed.data.statut)}`
      : undefined,
    parsed.data.agenceId ? `Agence : ${parsed.data.agenceId}` : undefined,
    parsed.data.dateFrom ? `Depuis : ${new Date(parsed.data.dateFrom).toLocaleDateString("fr-FR")}` : undefined,
    parsed.data.dateTo ? `Jusqu’au : ${new Date(parsed.data.dateTo).toLocaleDateString("fr-FR")}` : undefined,
  ].filter((value): value is string => Boolean(value));
  const pdfBuffer = await renderAttestationsDomiciliationExportPdf(
    result.items.map((row) => ({
      type: row.type,
      concessionnaireId: row.concessionnaireId,
      produitCode: row.produitCode,
      dateDemande: row.dateDemande,
      statut: getAttestationDomiciliationStatutLabel(row.statut),
      observations: row.observations,
    })),
    { generatedAt, filters },
  );

  return createPdfResponse(pdfBuffer, {
    filename: `attestations-domiciliation-${generatedAt.getTime()}`,
  });
}

