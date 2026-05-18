import { NextRequest, NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { z } from "zod";

import { requireApiAuth } from "@/lib/auth/guards";
import { ensureAuthLogsIndexes, listAuthLogs } from "@/lib/lonaci/auth-logs";

const querySchema = z.object({
  email: z.string().email().optional(),
  status: z.enum(["SUCCESS", "FAILED"]).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, { roles: ["CHEF_SERVICE"] });
  if ("error" in auth) return auth.error;

  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json({ message: "Parametres invalides", issues: parsed.error.issues }, { status: 400 });
  }

  await ensureAuthLogsIndexes();
  const result = await listAuthLogs({
    page: 1,
    pageSize: 5000,
    email: parsed.data.email,
    status: parsed.data.status,
    from: parsed.data.from ? new Date(parsed.data.from) : undefined,
    to: parsed.data.to ? new Date(parsed.data.to) : undefined,
  });

  const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 24, size: "A4", layout: "landscape" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(14).text("Export journal authentification", { underline: true });
    doc.moveDown(0.3);
    doc
      .fontSize(9)
      .text(
        `Filtres: email=${parsed.data.email ?? "ALL"} status=${parsed.data.status ?? "ALL"} from=${parsed.data.from ?? "-"} to=${parsed.data.to ?? "-"}`,
      );
    doc.fontSize(9).text(`Genere le: ${new Date().toLocaleString("fr-FR")} | total: ${result.logs.length}`);
    doc.moveDown(0.6);

    for (const row of result.logs) {
      doc
        .fontSize(8.8)
        .text(
          `${new Date(row.attemptedAt).toLocaleString("fr-FR")} | ${row.status} | ${row.email} | ip=${row.ipAddress ?? "-"} | reason=${row.reason ?? "-"}`,
        );
    }

    if (result.logs.length === 0) {
      doc.fontSize(9).text("Aucun log d'authentification pour ces filtres.");
    }

    doc.end();
  });

  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="auth-logs-${Date.now()}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
