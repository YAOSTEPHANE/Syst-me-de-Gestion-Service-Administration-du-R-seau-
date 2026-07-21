import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { concessionnaireListAgenceRestriction } from "@/lib/lonaci/concessionnaires";
import { listSuccessionCases } from "@/lib/lonaci/succession";
import { requireApiAuth } from "@/lib/auth/guards";
import { LONACI_ROLES } from "@/lib/lonaci/constants";
import { createPdfResponse } from "@/lib/pdf";
import { renderSuccessionsListPdf } from "@/lib/pdf/successions-list";

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
    roles: [...LONACI_ROLES],
  });
  if ("error" in auth) return auth.error;

  const parsed = schema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json({ message: "Parametres invalides", issues: parsed.error.issues }, { status: 400 });
  }

  const agenceRestriction = concessionnaireListAgenceRestriction(auth.user);
  const data = await listSuccessionCases(1, 2000, agenceRestriction, parsed.data.status, {
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
    visibility: auth.user,
  });

  if (parsed.data.format === "csv") {
    const lines = [
      "reference,concessionnaireId,statutMetier,statutMetierLabel,status,stepsCompleted,stepsTotal,decisionType,autoDossierContratReference,updatedAt",
      ...data.items.map((r) =>
        [
          r.reference,
          r.concessionnaireId,
          r.statutMetier,
          r.statutMetierLabel,
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

  const issuedAt = new Date();
  const pdf = await renderSuccessionsListPdf(data.items, issuedAt);
  return createPdfResponse(pdf, {
    filename: `succession-${issuedAt.toISOString().slice(0, 10)}.pdf`,
  });
}
