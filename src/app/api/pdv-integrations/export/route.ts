import { NextRequest, NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { z } from "zod";

import { requireApiAuth } from "@/lib/auth/guards";
import { ensureSprint4Indexes, listPdvIntegrations } from "@/lib/lonaci/sprint4";
import { PDV_INTEGRATION_STATUSES } from "@/lib/lonaci/constants";

const querySchema = z.object({
  format: z.enum(["excel", "pdf"]).default("excel"),
  agenceId: z.string().optional(),
  produitCode: z.string().optional(),
  status: z.enum(PDV_INTEGRATION_STATUSES).optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
});

function escapeCell(v: string) {
  return `"${v.replace(/"/g, '""')}"`;
}

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, { roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"] });
  if ("error" in auth) return auth.error;
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json({ message: "Parametres invalides", issues: parsed.error.issues }, { status: 400 });
  }
  await ensureSprint4Indexes();
  const result = await listPdvIntegrations({
    page: 1,
    pageSize: 20000,
    agenceId: parsed.data.agenceId?.trim() || undefined,
    produitCode: parsed.data.produitCode?.trim() || undefined,
    status: parsed.data.status,
    dateFrom: parsed.data.dateFrom ? new Date(parsed.data.dateFrom) : undefined,
    dateTo: parsed.data.dateTo ? new Date(parsed.data.dateTo) : undefined,
  });

  if (parsed.data.format === "excel") {
    const header = [
      "Reference",
      "Code PDV",
      "Agence",
      "Produit",
      "Nombre demandes",
      "Date demande",
      "Statut",
      "Latitude",
      "Longitude",
      "Observations",
    ];
    const lines = result.items.map((r) =>
      [
        r.reference,
        r.codePdv,
        r.agenceId ?? "",
        r.produitCode,
        String(r.nombreDemandes),
        r.dateDemande,
        r.status,
        String(r.gps.lat),
        String(r.gps.lng),
        r.observations ?? "",
      ]
        .map((x) => escapeCell(x))
        .join(","),
    );
    const csv = `\uFEFF${header.map(escapeCell).join(",")}\n${lines.join("\n")}`;
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="pdv-integrations-${Date.now()}.csv"`,
      },
    });
  }

  const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 28, size: "A4", layout: "landscape" });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(Buffer.from(c)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.fontSize(14).text("Journal integrations PDV", { underline: true });
    doc.moveDown(0.4);
    doc.fontSize(9).text(`Export: ${new Date().toLocaleString("fr-FR")}`);
    doc.moveDown(0.5);
    for (const row of result.items) {
      doc
        .fontSize(8)
        .text(
          `${row.reference} | ${row.codePdv} | ${row.agenceId ?? "-"} | ${row.produitCode} | n=${row.nombreDemandes} | ${new Date(row.dateDemande).toLocaleDateString("fr-FR")} | ${row.status}`,
        );
    }
    doc.end();
  });

  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="pdv-integrations-${Date.now()}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}

