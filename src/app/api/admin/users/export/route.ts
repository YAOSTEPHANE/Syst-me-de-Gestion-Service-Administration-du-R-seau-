import { NextRequest, NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { z } from "zod";

import { requireApiAuth } from "@/lib/auth/guards";
import { LONACI_ROLES } from "@/lib/lonaci/constants";
import { listUsers } from "@/lib/lonaci/users";

const querySchema = z.object({
  status: z.enum(["ALL", "ACTIF", "INACTIF"]).optional().default("ALL"),
  role: z.enum(LONACI_ROLES).optional(),
  agenceId: z.string().trim().optional(),
  q: z.string().trim().optional(),
});

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, { roles: ["CHEF_SERVICE"] });
  if ("error" in auth) return auth.error;

  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json({ message: "Parametres invalides", issues: parsed.error.issues }, { status: 400 });
  }

  const users = await listUsers();
  const statusFiltered =
    parsed.data.status === "ALL"
      ? users
      : users.filter((u) => (parsed.data.status === "ACTIF" ? u.actif : !u.actif));
  const roleFiltered = parsed.data.role ? statusFiltered.filter((u) => u.role === parsed.data.role) : statusFiltered;
  const agenceFiltered = parsed.data.agenceId
    ? roleFiltered.filter((u) => (u.agenceId ?? "").trim() === parsed.data.agenceId)
    : roleFiltered;
  const q = parsed.data.q?.trim().toLowerCase();
  const filtered = q
    ? agenceFiltered.filter((u) => {
        const haystack = [u.email, u.nom, u.prenom, u.matricule ?? "", u.role].join(" ").toLowerCase();
        return haystack.includes(q);
      })
    : agenceFiltered;

  const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 24, size: "A4", layout: "landscape" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(14).text("Export utilisateurs", { underline: true });
    doc.moveDown(0.3);
    doc
      .fontSize(9)
      .text(
        `Filtres: status=${parsed.data.status} role=${parsed.data.role ?? "ALL"} agence=${parsed.data.agenceId ?? "ALL"} q=${parsed.data.q ?? ""}`,
      );
    doc.fontSize(9).text(`Genere le: ${new Date().toLocaleString("fr-FR")} | total: ${filtered.length}`);
    doc.moveDown(0.6);

    for (const row of filtered) {
      doc
        .fontSize(8.8)
        .text(
          `${row.prenom} ${row.nom} | ${row.email} | matricule=${row.matricule ?? "-"} | role=${row.role} | agence=${row.agenceId ?? "-"} | statut=${row.actif ? "ACTIF" : "INACTIF"} | derniereConnexion=${row.derniereConnexion?.toISOString() ?? "-"}`,
        );
    }

    if (filtered.length === 0) {
      doc.fontSize(9).text("Aucun utilisateur pour ces filtres.");
    }

    doc.end();
  });

  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="users-${Date.now()}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
