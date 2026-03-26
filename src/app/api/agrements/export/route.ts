import { NextRequest, NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { z } from "zod";

import { ensureAgrementsIndexes, listAgrements } from "@/lib/lonaci/agrements";
import { requireApiAuth } from "@/lib/auth/guards";

const schema = z.object({
  format: z.enum(["excel", "pdf"]).default("excel"),
  agenceId: z.string().optional(),
  produitCode: z.string().optional(),
  statut: z.enum(["RECU", "CONTROLE", "TRANSMIS", "FINALISE"]).optional(),
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
  await ensureAgrementsIndexes();
  const result = await listAgrements({
    page: 1,
    pageSize: 20000,
    agenceId: parsed.data.agenceId?.trim() || undefined,
    produitCode: parsed.data.produitCode?.trim() || undefined,
    statut: parsed.data.statut,
    dateFrom: parsed.data.dateFrom ? new Date(parsed.data.dateFrom) : undefined,
    dateTo: parsed.data.dateTo ? new Date(parsed.data.dateTo) : undefined,
  });

  if (parsed.data.format === "excel") {
    const header = ["Reference", "Produit", "Date reception", "Ref officielle", "Agence", "Statut", "Observations"];
    const lines = result.items.map((r) =>
      [r.reference, r.produitCode, r.dateReception, r.referenceOfficielle, r.agenceId ?? "", r.statut, r.observations ?? ""]
        .map((x) => escapeCell(String(x)))
        .join(","),
    );
    const csv = `\uFEFF${header.map(escapeCell).join(",")}\n${lines.join("\n")}`;
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="agrements-${Date.now()}.csv"`,
      },
    });
  }

  const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(Buffer.from(c)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.fontSize(16).text("Synthese Agrements", { underline: true });
    doc.moveDown(0.5);
    for (const row of result.items) {
      doc
        .fontSize(9)
        .text(
          `${row.reference} | ${row.produitCode} | ${new Date(row.dateReception).toLocaleDateString("fr-FR")} | ${row.statut} | ${row.referenceOfficielle}`,
        );
    }
    doc.end();
  });
  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="agrements-${Date.now()}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}

