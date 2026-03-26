import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import PDFDocument from "pdfkit";

import { BANCARISATION_STATUTS, CONCESSIONNAIRE_STATUTS } from "@/lib/lonaci/constants";
import { ensureConcessionnaireIndexes, searchConcessionnaires } from "@/lib/lonaci/concessionnaires";
import { requireApiAuth } from "@/lib/auth/guards";

const querySchema = z.object({
  format: z.enum(["excel", "pdf"]).default("excel"),
  q: z.string().optional(),
  statut: z.enum(CONCESSIONNAIRE_STATUTS).optional(),
  statutBancarisation: z.enum(BANCARISATION_STATUTS).optional(),
  agenceId: z.string().optional(),
  produitCode: z.string().optional(),
});

function listScopeAgenceId(user: { agenceId: string | null; role: string }): string | undefined {
  if (user.role === "CHEF_SERVICE" && user.agenceId === null) {
    return undefined;
  }
  if (user.agenceId) return user.agenceId;
  return undefined;
}

function toCsv(rows: Awaited<ReturnType<typeof searchConcessionnaires>>["items"]) {
  const header = [
    "Code PDV",
    "Nom complet",
    "CNI",
    "Telephone principal",
    "Telephone secondaire",
    "Agence ID",
    "Produits",
    "Statut",
    "Bancarisation",
    "Ville",
    "Latitude",
    "Longitude",
  ];
  const escapeCell = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = rows.map((r) =>
    [
      r.codePdv,
      r.nomComplet || r.raisonSociale,
      r.cniNumero ?? "",
      r.telephonePrincipal ?? "",
      r.telephoneSecondaire ?? "",
      r.agenceId ?? "",
      r.produitsAutorises.join("|"),
      r.statut,
      r.statutBancarisation,
      r.ville ?? "",
      r.gps ? String(r.gps.lat) : "",
      r.gps ? String(r.gps.lng) : "",
    ]
      .map((x) => escapeCell(x))
      .join(","),
  );
  return `\uFEFF${header.map(escapeCell).join(",")}\n${lines.join("\n")}`;
}

function toPdfBuffer(rows: Awaited<ReturnType<typeof searchConcessionnaires>>["items"]) {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 30, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(14).text("Export Concessionnaires", { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(10).text(`Total: ${rows.length} | Date: ${new Date().toLocaleString("fr-FR")}`);
    doc.moveDown(1);

    rows.forEach((r, idx) => {
      const line = `${idx + 1}. ${r.codePdv} - ${r.nomComplet || r.raisonSociale} | CNI: ${
        r.cniNumero ?? "—"
      } | Tel: ${r.telephonePrincipal ?? "—"} | Statut: ${r.statut} | Agence: ${r.agenceId ?? "—"}`;
      doc.fontSize(8.5).text(line);
      if (doc.y > 780) {
        doc.addPage();
      }
    });
    doc.end();
  });
}

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, {
    roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
  });
  if ("error" in auth) return auth.error;

  const raw = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = querySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ message: "Parametres invalides", issues: parsed.error.issues }, { status: 400 });
  }

  await ensureConcessionnaireIndexes();
  const scope = listScopeAgenceId(auth.user);
  const result = await searchConcessionnaires({
    page: 1,
    pageSize: 5000,
    q: parsed.data.q,
    statut: parsed.data.statut,
    statutBancarisation: parsed.data.statutBancarisation,
    agenceId: parsed.data.agenceId,
    produitCode: parsed.data.produitCode,
    scopeAgenceId: scope,
    includeDeleted: false,
  });

  if (parsed.data.format === "excel") {
    const csv = toCsv(result.items);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="concessionnaires-${Date.now()}.csv"`,
      },
    });
  }

  const pdf = await toPdfBuffer(result.items);
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="concessionnaires-${Date.now()}.pdf"`,
    },
  });
}

