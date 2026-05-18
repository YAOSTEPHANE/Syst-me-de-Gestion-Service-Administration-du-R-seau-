import { NextRequest, NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { z } from "zod";

import { requireApiAuth } from "@/lib/auth/guards";
import { ensureMonitoringEventsIndexes, listMonitoringEvents } from "@/lib/observability/events";

const querySchema = z.object({
  code: z.string().optional(),
  status: z.enum(["OPEN", "ACK"]).optional(),
});

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, { roles: ["CHEF_SERVICE"] });
  if ("error" in auth) return auth.error;

  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json({ message: "Parametres invalides", issues: parsed.error.issues }, { status: 400 });
  }

  await ensureMonitoringEventsIndexes();
  const result = await listMonitoringEvents({
    page: 1,
    pageSize: 5000,
    code: parsed.data.code,
    status: parsed.data.status,
  });

  const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 24, size: "A4", layout: "landscape" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(14).text("Export monitoring events", { underline: true });
    doc.moveDown(0.3);
    doc
      .fontSize(9)
      .text(
        `Filtres: code=${parsed.data.code ?? "ALL"} status=${parsed.data.status ?? "ALL"} | total=${result.items.length}`,
      );
    doc.fontSize(9).text(`Genere le: ${new Date().toLocaleString("fr-FR")}`);
    doc.moveDown(0.6);

    for (const row of result.items) {
      doc
        .fontSize(8.6)
        .text(
          `${new Date(row.createdAt).toLocaleString("fr-FR")} | ${row.code} | ${row.status} | cible=${row.roleTarget} | ${row.title} | ${row.message}`,
        );
    }

    if (result.items.length === 0) {
      doc.fontSize(9).text("Aucun evenement pour ces filtres.");
    }

    doc.end();
  });

  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="monitoring-events-${Date.now()}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
