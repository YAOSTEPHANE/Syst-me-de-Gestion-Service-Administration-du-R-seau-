import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireApiAuth } from "@/lib/auth/guards";
import { LONACI_ROLES } from "@/lib/lonaci/constants";
import { listUsers } from "@/lib/lonaci/users";
import { createPdfResponse, renderAdminUsersExportPdf } from "@/lib/pdf";

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
  const generatedAt = new Date();
  const pdfBuffer = await renderAdminUsersExportPdf(
    filtered.map((row) => ({
      nomComplet: `${row.prenom} ${row.nom}`,
      email: row.email,
      matricule: row.matricule ?? "-",
      role: row.role,
      agence: row.agenceId ?? "-",
      statut: row.actif ? "ACTIF" : "INACTIF",
      derniereConnexion: row.derniereConnexion ?? null,
    })),
    {
      status: parsed.data.status,
      role: parsed.data.role ?? "ALL",
      agence: parsed.data.agenceId ?? "ALL",
      recherche: parsed.data.q ?? "",
    },
    generatedAt,
  );

  return createPdfResponse(pdfBuffer, {
    filename: `users-${generatedAt.getTime()}.pdf`,
  });
}
