import { NextRequest, NextResponse } from "next/server";

import { requireApiAuth } from "@/lib/auth/guards";
import { findConcessionnaireById } from "@/lib/lonaci/concessionnaires";
import { findVisibleDossierById } from "@/lib/lonaci/dossiers";
import {
  ensureDossierDocumentChecklist,
} from "@/lib/lonaci/produit-document-checklist";
import { renderDossierChecklistPdf } from "@/lib/lonaci/produit-document-checklist-pdf";
import { resolveProduitForContratWorkflow } from "@/lib/lonaci/contrat-produits";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth(request, {
    roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE", "AUDITEUR"],
  });
  if ("error" in auth) {
    return auth.error;
  }

  const { id } = await context.params;
  const dossier = await findVisibleDossierById(id, auth.user);
  if (!dossier) {
    return NextResponse.json({ message: "Dossier introuvable." }, { status: 404 });
  }
  if (dossier.type !== "CONTRAT_ACTUALISATION") {
    return NextResponse.json({ message: "Checklist reservee aux dossiers contrat." }, { status: 400 });
  }

  const concessionnaire = await findConcessionnaireById(dossier.concessionnaireId);
  if (!concessionnaire || concessionnaire.deletedAt) {
    return NextResponse.json({ message: "Dossier introuvable." }, { status: 404 });
  }

  const produitCode = String(dossier.payload?.produitCode ?? "").trim().toUpperCase();
  const produit = produitCode ? await resolveProduitForContratWorkflow(produitCode) : null;
  const checklist = ensureDossierDocumentChecklist(
    dossier.payload ?? {},
    produit?.documentsChecklist ?? [],
  );

  const pdf = await renderDossierChecklistPdf({
    dossierReference: dossier.reference,
    produitCode: produitCode || "—",
    produitLibelle: produit?.libelle ?? (produitCode || "—"),
    concessionnaireLabel: concessionnaire.nomComplet || concessionnaire.codePdv || "—",
    checklist,
    generatedAt: new Date(),
  });

  const filename = `checklist-${dossier.reference.replace(/[^\w-]+/g, "_")}.pdf`;
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
