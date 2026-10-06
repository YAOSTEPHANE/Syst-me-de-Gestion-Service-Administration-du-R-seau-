import { NextRequest, NextResponse } from "next/server";

import { requireApiAuth } from "@/lib/auth/guards";
import { buildContratRecapitulatifData } from "@/lib/lonaci/contrat-recapitulatif-data";
import { resolveDocumentAgentName } from "@/lib/lonaci/document-agent";
import { findVisibleDossierById } from "@/lib/lonaci/dossiers";
import { renderContratRecapitulatifPdf } from "@/lib/pdf/contrat-recapitulatif";
import { createPdfResponse } from "@/lib/pdf";

interface RouteContext {
  params: Promise<{ dossierId: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth(request, {
    roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
    moduleKey: "DOSSIERS",
    rbac: { resource: "DOSSIERS", action: "READ" },
  });
  if ("error" in auth) return auth.error;

  const { dossierId } = await context.params;
  const dossier = await findVisibleDossierById(dossierId, auth.user);
  if (!dossier) {
    return NextResponse.json({ message: "Dossier introuvable." }, { status: 404 });
  }

  const [agentNom, data] = await Promise.all([
    resolveDocumentAgentName({ actor: auth.user }),
    buildContratRecapitulatifData(dossier),
  ]);
  const pdf = await renderContratRecapitulatifPdf(data, new Date(), agentNom);
  return createPdfResponse(pdf, {
    filename: `recapitulatif-contrat-${dossier.reference}.pdf`,
    disposition: request.nextUrl.searchParams.get("view") === "1" ? "inline" : "attachment",
  });
}
