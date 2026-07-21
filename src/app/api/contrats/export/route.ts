import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { listAgenceScopeFields, requireListAgenceScope } from "@/lib/api/list-agence-scope";
import { requireApiAuth } from "@/lib/auth/guards";
import { LONACI_ROLES } from "@/lib/lonaci/constants";
import { listVisibleDossierIds } from "@/lib/lonaci/dossiers";
import { prisma } from "@/lib/prisma";

const querySchema = z.object({
  format: z.enum(["excel", "pdf"]).default("excel"),
});

function escapeCell(v: string) {
  return `"${v.replace(/"/g, '""')}"`;
}

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, {
    roles: [...LONACI_ROLES],
    rbac: { resource: "CONTRATS", action: "READ" },
  });
  if ("error" in auth) return auth.error;

  const raw = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = querySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ message: "Parametres invalides", issues: parsed.error.issues }, { status: 400 });
  }

  const agenceScope = requireListAgenceScope(auth.user);
  if (!agenceScope.ok) return agenceScope.response;
  const scopeFields = listAgenceScopeFields(agenceScope);
  const scopedAgenceIds = scopeFields.scopeAgenceIds
    ?? (scopeFields.scopeAgenceId ? [scopeFields.scopeAgenceId] : null);
  const concessionnaireFilter = {
    deletedAt: null,
    ...(scopedAgenceIds ? { agenceId: { in: scopedAgenceIds } } : {}),
  };

  const concessionnaires = await prisma.concessionnaire.findMany({
    where: concessionnaireFilter,
    select: { id: true, codePdv: true, nomComplet: true, raisonSociale: true, agenceId: true },
  });
  const consMap = new Map(concessionnaires.map((c) => [c.id, c]));

  const clients =
    scopedAgenceIds != null
      ? await prisma.lonaciClient.findMany({
          where: { deletedAt: null, agenceId: { in: scopedAgenceIds } },
          select: { id: true, code: true, nomComplet: true, raisonSociale: true },
        })
      : [];
  const clientMap = new Map(clients.map((c) => [c.id, c]));
  const allowedPdvIds = scopedAgenceIds ? new Set(concessionnaires.map((c) => c.id)) : null;
  const allowedClientIds = scopedAgenceIds ? new Set(clients.map((c) => c.id)) : null;
  const visibleDossierIds = await listVisibleDossierIds(
    auth.user,
    { agenceId: scopeFields.agenceId, agenceIds: scopeFields.agenceIds },
    "CONTRAT_ACTUALISATION",
  );

  const contrats = await prisma.contrat.findMany({
    where: {
      deletedAt: null,
      dossierId: { in: visibleDossierIds },
    },
    orderBy: { createdAt: "desc" },
    take: 20_000,
  });

  const rows = contrats.filter((c) => {
    if (!allowedPdvIds && !allowedClientIds) return true;
    if (c.lonaciClientId?.trim() && allowedClientIds?.has(c.lonaciClientId)) return true;
    if (c.concessionnaireId?.trim() && allowedPdvIds?.has(c.concessionnaireId)) return true;
    return false;
  });

  const header = [
    "Reference",
    "Code PDV",
    "Nom PDV",
    "Produit",
    "Operation",
    "Statut",
    "Date effet",
    "Dossier ID",
    "Cree le",
  ];
  const lines = rows.map((r) => {
    const client = r.lonaciClientId ? clientMap.get(r.lonaciClientId) : undefined;
    const pdv = r.concessionnaireId ? consMap.get(r.concessionnaireId) : undefined;
    const nomPdv = client
      ? client.nomComplet || client.raisonSociale
      : pdv
        ? pdv.nomComplet || pdv.raisonSociale
        : "";
    const codePdv = client?.code ?? pdv?.codePdv ?? "";
    return [
      r.reference,
      codePdv,
      nomPdv,
      r.produitCode,
      r.operationType,
      r.status,
      r.dateEffet.toISOString(),
      r.dossierId,
      r.createdAt.toISOString(),
    ]
      .map((x) => escapeCell(String(x)))
      .join(",");
  });

  const csv = `\uFEFF${header.map(escapeCell).join(",")}\n${lines.join("\n")}`;

  if (parsed.data.format === "pdf") {
    return NextResponse.json(
      { message: "Export PDF contrats non disponible — utilisez le format Excel (CSV)." },
      { status: 501 },
    );
  }

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="contrats-${Date.now()}.csv"`,
    },
  });
}
