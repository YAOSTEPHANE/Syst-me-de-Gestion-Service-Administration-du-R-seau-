import { NextRequest, NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { z } from "zod";

import { BANCARISATION_STATUTS } from "@/lib/lonaci/constants";
import { concessionnaireListScopeAgenceId, searchConcessionnaires } from "@/lib/lonaci/concessionnaires";
import { requireApiAuth } from "@/lib/auth/guards";

const querySchema = z.object({
  format: z.enum(["excel", "pdf"]).default("excel"),
  statutBancarisation: z.enum(BANCARISATION_STATUTS).optional(),
  agenceId: z.string().optional(),
  produitCode: z.string().optional(),
});

function toCsv(rows: Awaited<ReturnType<typeof searchConcessionnaires>>["items"]) {
  const header = ["Code PDV", "Nom", "Statut bancarisation", "Compte", "Banque", "Agence", "Produits"];
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const body = rows.map((r) =>
    [
      r.codePdv,
      r.nomComplet || r.raisonSociale,
      r.statutBancarisation,
      r.compteBancaire ?? "",
      r.banqueEtablissement ?? "",
      r.agenceId ?? "",
      r.produitsAutorises.join("|"),
    ]
      .map(esc)
      .join(","),
  );
  return `\uFEFF${header.map(esc).join(",")}\n${body.join("\n")}`;
}

function toPdfBuffer(rows: Awaited<ReturnType<typeof searchConcessionnaires>>["items"]) {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 30, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(Buffer.from(c)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.fontSize(14).text("Export Bancarisation", { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(10).text(`Total: ${rows.length} | Date: ${new Date().toLocaleString("fr-FR")}`);
    doc.moveDown(1);
    rows.forEach((r, i) => {
      doc
        .fontSize(8.5)
        .text(
          `${i + 1}. ${r.codePdv} | ${r.nomComplet || r.raisonSociale} | ${r.statutBancarisation} | ${
            r.compteBancaire ?? "—"
          } | ${r.banqueEtablissement ?? "—"}`,
        );
      if (doc.y > 780) doc.addPage();
    });
    doc.end();
  });
}

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, { roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"] });
  if ("error" in auth) return auth.error;

  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json({ message: "Parametres invalides", issues: parsed.error.issues }, { status: 400 });
  }

  const result = await searchConcessionnaires({
    page: 1,
    pageSize: 5000,
    statutBancarisation: parsed.data.statutBancarisation,
    agenceId: parsed.data.agenceId,
    produitCode: parsed.data.produitCode,
    scopeAgenceId: concessionnaireListScopeAgenceId(auth.user),
    includeDeleted: false,
  });

  if (parsed.data.format === "excel") {
    const csv = toCsv(result.items);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="bancarisation-${Date.now()}.csv"`,
      },
    });
  }
  const pdf = await toPdfBuffer(result.items);
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="bancarisation-${Date.now()}.pdf"`,
    },
  });
}
