import { NextRequest, NextResponse } from "next/server";

import { requireApiAuth } from "@/lib/auth/guards";
import { loadPartySnapshotForDossier } from "@/lib/lonaci/contrat-party-snapshot";
import { resolveDocumentAgentName } from "@/lib/lonaci/document-agent";
import { ensureChecklistForDossierProduits, getDossierProduitCodes } from "@/lib/lonaci/dossier-produits";
import { findVisibleDossierById } from "@/lib/lonaci/dossiers";
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

  const party = await loadPartySnapshotForDossier(dossier);
  if (!party) {
    return NextResponse.json(
      { message: "Client ou concessionnaire du dossier introuvable." },
      { status: 404 },
    );
  }

  const produitCodes = getDossierProduitCodes(dossier.payload ?? {});
  const [checklist, produits, agentNom] = await Promise.all([
    ensureChecklistForDossierProduits(dossier.payload ?? {}, produitCodes),
    Promise.all(produitCodes.map((code) => resolveProduitForContratWorkflow(code))),
    resolveDocumentAgentName({ actor: auth.user }),
  ]);
  const produitLibelles = produitCodes.map((code, i) => produits[i]?.libelle ?? code);

  const pdf = await renderDossierChecklistPdf({
    dossierReference: dossier.reference,
    produitCode: produitCodes.join(" + ") || "—",
    produitLibelle: produitLibelles.join(" + ") || "—",
    concessionnaireLabel: party.nomComplet || party.raisonSociale || party.codePdv || "—",
    partyKindLabel: party.partyKind === "client" ? "Client" : "Concessionnaire",
    checklist,
    generatedAt: new Date(),
    agentNom,
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
