import { NextRequest, NextResponse } from "next/server";
import PDFDocument from "pdfkit";

import { requireApiAuth } from "@/lib/auth/guards";
import { ensureReferentialsIndexes, listAgences } from "@/lib/lonaci/referentials";

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, { roles: ["CHEF_SERVICE"] });
  if ("error" in auth) return auth.error;

  await ensureReferentialsIndexes();
  const agences = await listAgences();

  const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 28, size: "A4", layout: "landscape" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(14).text("Export agences (referentiel)", { underline: true });
    doc.moveDown(0.4);
    doc.fontSize(9).text(`Genere le: ${new Date().toLocaleString("fr-FR")}`);
    doc.moveDown(0.6);

    for (const row of agences) {
      const zone = row.zoneGeographique === "ABIDJAN" ? "Abidjan" : "Interieur";
      const actif = row.actif ? "ACTIF" : "INACTIF";
      doc
        .fontSize(9)
        .text(
          `${row.code} | ${row.libelle} | zone=${zone} | actif=${actif} | id=${row._id ?? ""}`,
        );
    }

    if (agences.length === 0) {
      doc.fontSize(9).text("Aucune agence.");
    }

    doc.end();
  });

  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="agences-${Date.now()}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
