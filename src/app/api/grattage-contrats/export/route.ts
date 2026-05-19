import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireApiAuth } from "@/lib/auth/guards";
import { GRATTAGE_CONTRAT_STATUTS } from "@/lib/lonaci/constants";
import {
  buildGrattageContratsPdfBuffer,
  ensureGrattageContratIndexes,
  listGrattageContratsForExport,
} from "@/lib/lonaci/grattage-contrats";
import { GRATTAGE_CONTRAT_ROLES } from "@/lib/lonaci/grattage-access";

function listScopeAgenceId(user: { agenceId: string | null; role: string }): string | undefined {
  if (user.role === "CHEF_SERVICE" && user.agenceId === null) return undefined;
  if (user.agenceId) return user.agenceId;
  return undefined;
}

const querySchema = z.object({
  format: z.enum(["pdf"]).default("pdf"),
  agenceId: z.string().optional(),
  concessionnaireId: z.string().optional(),
  statut: z.enum(GRATTAGE_CONTRAT_STATUTS).optional(),
});

/** §9.3 — Export PDF de la liste des contrats grattage. */
export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, { roles: [...GRATTAGE_CONTRAT_ROLES] });
  if ("error" in auth) return auth.error;

  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json({ message: "Parametres invalides", issues: parsed.error.issues }, { status: 400 });
  }

  await ensureGrattageContratIndexes();
  const rows = await listGrattageContratsForExport({
    agenceId: parsed.data.agenceId,
    concessionnaireId: parsed.data.concessionnaireId,
    statut: parsed.data.statut,
    scopeAgenceId: listScopeAgenceId(auth.user),
  });

  const buffer = await buildGrattageContratsPdfBuffer(rows);
  const filename = `contrats-grattage-${Date.now()}.pdf`;
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
