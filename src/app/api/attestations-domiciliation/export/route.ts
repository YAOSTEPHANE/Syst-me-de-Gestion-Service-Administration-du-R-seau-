import { NextRequest, NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { z } from "zod";

import { ensureAttestationsDomiciliationIndexes, listDemandesAttestationsDomiciliation } from "@/lib/lonaci/attestations-domiciliation";
import { requireApiAuth } from "@/lib/auth/guards";

const schema = z.object({
  format: z.enum(["excel", "pdf"]).default("excel"),
  type: z.enum(["ATTESTATION_REVENU", "DOMICILIATION_PRODUIT"]).optional(),
  concessionnaireId: z.string().optional(),
  produitCode: z.string().optional(),
  statut: z.enum(["DEMANDE_RECUE", "TRANSMIS", "FINALISE"]).optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
});

function escapeCell(v: string) {
  return `"${v.replace(/"/g, '""')}"`;
}

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, { roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"] });
  if ("error" in auth) return auth.error;

  const parsed = schema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json({ message: "Parametres invalides", issues: parsed.error.issues }, { status: 400 });
  }

  await ensureAttestationsDomiciliationIndexes();
  const result = await listDemandesAttestationsDomiciliation({
    page: 1,
    pageSize: 20000,
    type: parsed.data.type,
    concessionnaireId: parsed.data.concessionnaireId?.trim() || undefined,
    produitCode: parsed.data.produitCode?.trim() || undefined,
    statut: parsed.data.statut,
    dateFrom: parsed.data.dateFrom ? new Date(parsed.data.dateFrom) : undefined,
    dateTo: parsed.data.dateTo ? new Date(parsed.data.dateTo) : undefined,
  });

  if (parsed.data.format === "excel") {
    const header = ["Type", "ConcessionnaireId", "Produit", "Date demande", "Statut", "Observations"];
    const lines = result.items.map((r) =>
      [
        r.type,
        r.concessionnaireId ?? "",
        r.produitCode ?? "",
        r.dateDemande,
        r.statut,
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

  const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(Buffer.from(c)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(16).text("Synthese Attestations & domiciliation", { underline: true });
    doc.moveDown(0.5);
    for (const row of result.items) {
      doc
        .fontSize(9)
        .text(
          `${row.type} | ${row.produitCode ?? "—"} | ${new Date(row.dateDemande).toLocaleDateString("fr-FR")} | ${row.statut} | ${row.concessionnaireId ?? "—"}`,
        );
      if (row.observations) {
        doc.fontSize(8).fillColor("#444").text(row.observations, { indent: 10 });
        doc.fillColor("#000");
      }
    }
    doc.end();
  });

  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="attestations-domiciliation-${Date.now()}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}

