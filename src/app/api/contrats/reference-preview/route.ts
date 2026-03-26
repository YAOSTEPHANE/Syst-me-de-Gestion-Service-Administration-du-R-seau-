import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { previewNextContratReference } from "@/lib/lonaci/contracts";
import { requireApiAuth } from "@/lib/auth/guards";

const querySchema = z.object({
  produitCode: z.string().min(1),
  /** Date d’effet / d’opération (YYYY-MM-DD). */
  dateEffet: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

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

  const [y, mo, d] = parsed.data.dateEffet.split("-").map(Number);
  const dateEffet = new Date(y, mo - 1, d, 12, 0, 0, 0);
  if (Number.isNaN(dateEffet.getTime())) {
    return NextResponse.json({ message: "Date invalide" }, { status: 400 });
  }

  const reference = await previewNextContratReference(parsed.data.produitCode, dateEffet);
  return NextResponse.json(
    {
      reference,
      pattern: "CONTRAT-[PRODUIT]-[ANNÉE]-[MOIS]-[SÉQUENCE]",
      note:
        "Indicatif : la référence définitive est attribuée à la finalisation du dossier (compteur mensuel par produit).",
    },
    { status: 200 },
  );
}
