import { NextRequest, NextResponse } from "next/server";
import PDFDocument from "pdfkit";

import { findDossierById } from "@/lib/lonaci/dossiers";
import { requireApiAuth } from "@/lib/auth/guards";

interface RouteContext {
  params: Promise<{ dossierId: string }>;
}

function toPdfBuffer(dossier: Awaited<ReturnType<typeof findDossierById>>) {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(16).text("Recapitulatif dossier contrat", { underline: true });
    doc.moveDown(0.8);
    doc.fontSize(11).text(`Reference dossier: ${dossier?.reference ?? "-"}`);
    doc.text(`Statut: ${dossier?.status ?? "-"}`);
    doc.text(`Concessionnaire: ${String(dossier?.concessionnaireId ?? "-")}`);
    doc.text(`Produit: ${String(dossier?.payload?.produitCode ?? "-")}`);
    doc.text(`Type: ${String(dossier?.payload?.operationType ?? "-")}`);
    doc.text(`Date operation: ${String(dossier?.payload?.dateOperation ?? "-")}`);
    doc.text(`Observations: ${String(dossier?.payload?.observations ?? "-")}`);
    doc.moveDown(1);
    doc.fontSize(12).text("Historique des validations");
    doc.moveDown(0.4);
    for (const h of dossier?.history ?? []) {
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

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth(request, {
    roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
  });
  if ("error" in auth) return auth.error;

  const { dossierId } = await context.params;
  const dossier = await findDossierById(dossierId);
  if (!dossier || dossier.deletedAt) {
    return NextResponse.json({ message: "Dossier introuvable." }, { status: 404 });
  }

  const pdf = await toPdfBuffer(dossier);
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="dossier-${dossier.reference}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}

