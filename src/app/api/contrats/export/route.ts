import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireApiAuth } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";

const querySchema = z.object({
  format: z.enum(["excel", "pdf"]).default("excel"),
});

function listScopeAgenceId(user: { agenceId: string | null; role: string }): string | undefined {
  if (user.role === "CHEF_SERVICE" && user.agenceId === null) {
    return undefined;
  }
  if (user.agenceId) return user.agenceId;
  return undefined;
}

function escapeCell(v: string) {
  return `"${v.replace(/"/g, '""')}"`;
}

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, {
    roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
  });
  if ("error" in auth) return auth.error;

  const raw = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = querySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ message: "Parametres invalides", issues: parsed.error.issues }, { status: 400 });
  }

  const scopeAgenceId = listScopeAgenceId(auth.user);

  let concessionnaireFilter: { deletedAt: null; agenceId?: string } = { deletedAt: null };
  if (scopeAgenceId) {
    concessionnaireFilter = { deletedAt: null, agenceId: scopeAgenceId };
  }

  const concessionnaires = await prisma.concessionnaire.findMany({
    where: concessionnaireFilter,
    select: { id: true, codePdv: true, nomComplet: true, raisonSociale: true, agenceId: true },
  });
  const consMap = new Map(concessionnaires.map((c) => [c.id, c]));

  const allowedIds = scopeAgenceId ? new Set(concessionnaires.map((c) => c.id)) : null;

  const contrats = await prisma.contrat.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 20_000,
  });

  const rows = allowedIds
    ? contrats.filter((c) => allowedIds.has(c.concessionnaireId))
    : contrats;

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
    const pdv = consMap.get(r.concessionnaireId);
    const nomPdv = pdv ? pdv.nomComplet || pdv.raisonSociale : "";
    const codePdv = pdv?.codePdv ?? "";
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
