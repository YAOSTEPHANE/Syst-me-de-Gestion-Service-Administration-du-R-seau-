import { NextRequest, NextResponse } from "next/server";

import { requireApiAuth } from "@/lib/auth/guards";
import { assertDossierPartyReadable, contratPartyFromDossier } from "@/lib/lonaci/dossier-contrat-party";
import { findDossierById } from "@/lib/lonaci/dossiers";

interface RouteContext {
  params: Promise<{ dossierId: string }>;
}

async function toPdfBuffer(dossier: NonNullable<Awaited<ReturnType<typeof findDossierById>>>) {
  const { default: PDFDocument } = await import("pdfkit");
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(16).text("Recapitulatif dossier contrat", { underline: true });
    doc.moveDown(0.8);
    doc.fontSize(11).text(`Reference dossier: ${dossier.reference ?? "-"}`);
    doc.text(`Statut: ${dossier.status ?? "-"}`);
    doc.text(`Client: ${String(dossier.lonaciClientId ?? "-")}`);
    doc.text(`Concessionnaire: ${String(dossier.concessionnaireId ?? "-")}`);
    doc.text(`Produit: ${String(dossier.payload?.produitCode ?? "-")}`);
    doc.text(`Type: ${String(dossier.payload?.operationType ?? "-")}`);
    doc.text(`Date operation: ${String(dossier.payload?.dateOperation ?? "-")}`);
    doc.text(`Observations: ${String(dossier.payload?.observations ?? "-")}`);
    doc.moveDown(1);
    doc.fontSize(12).text("Historique des validations");
    doc.moveDown(0.4);
    for (const h of dossier.history ?? []) {
      doc
        .fontSize(10)
        .text(
          `${h.status} | ${h.actedAt.toLocaleString("fr-FR")} | ${h.actedByUserId} | ${
            h.comment ?? "-"
          }`,
        );
    }
    doc.end();
  });
}

function pdfDisposition(request: NextRequest, filename: string): string {
  const view = request.nextUrl.searchParams.get("view") === "1";
  return view ? `inline; filename="${filename}"` : `attachment; filename="${filename}"`;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth(request, {
    roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
    moduleKey: "DOSSIERS",
    rbac: { resource: "DOSSIERS", action: "READ" },
  });
  if ("error" in auth) return auth.error;

  const { dossierId } = await context.params;
  const dossier = await findDossierById(dossierId);
  if (!dossier || dossier.deletedAt) {
    return NextResponse.json({ message: "Dossier introuvable." }, { status: 404 });
  }

  const party = contratPartyFromDossier(dossier);
  if (!party) {
    return NextResponse.json({ message: "Dossier sans rattachement client ou PDV." }, { status: 404 });
  }
  try {
    await assertDossierPartyReadable(party, auth.user);
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "AGENCE_FORBIDDEN") {
      return NextResponse.json({ message: "Acces refuse pour cette agence.", code }, { status: 403 });
    }
    if (code === "CLIENT_NOT_FOUND" || code === "CONCESSIONNAIRE_NOT_FOUND") {
      return NextResponse.json({ message: "Titulaire du dossier introuvable.", code }, { status: 404 });
    }
    return NextResponse.json({ message: "Acces refuse.", code }, { status: 403 });
  }

  const pdf = await toPdfBuffer(dossier);
  const filename = `dossier-${dossier.reference}.pdf`;
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": pdfDisposition(request, filename),
      "Cache-Control": "no-store",
    },
  });
}
