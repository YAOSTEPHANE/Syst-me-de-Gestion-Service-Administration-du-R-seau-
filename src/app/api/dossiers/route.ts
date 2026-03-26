import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { userHasNationalScope } from "@/lib/lonaci/access";
import { CONTRAT_OPERATION_TYPES, DOSSIER_STATUSES, DOSSIER_TYPES } from "@/lib/lonaci/constants";
import { createDossier, ensureDossierIndexes, listDossiers } from "@/lib/lonaci/dossiers";
import { requireApiAuth } from "@/lib/auth/guards";

const createSchema = z.object({
  type: z.enum(DOSSIER_TYPES),
  concessionnaireId: z.string().min(1),
  payload: z.object({
    produitCode: z.string().min(1),
    operationType: z.enum(CONTRAT_OPERATION_TYPES),
    dateEffet: z.string().datetime(),
    commentaire: z.string().max(5000).optional(),
  }),
});

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(DOSSIER_STATUSES).optional(),
  type: z.enum(DOSSIER_TYPES).optional(),
});

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, {
    roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
  });
  if ("error" in auth) {
    return auth.error;
  }
  const raw = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = listSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ message: "Parametres invalides", issues: parsed.error.issues }, { status: 400 });
  }
  await ensureDossierIndexes();
  const scopeAgenceId = userHasNationalScope(auth.user) ? undefined : auth.user.agenceId;
  const result = await listDossiers(
    parsed.data.page,
    parsed.data.pageSize,
    parsed.data.status,
    parsed.data.type,
    scopeAgenceId,
  );
  return NextResponse.json(result, { status: 200 });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(request, {
    roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
  });
  if ("error" in auth) {
    return auth.error;
  }
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "Donnees invalides", issues: parsed.error.issues }, { status: 400 });
  }
  await ensureDossierIndexes();
  try {
    const dossier = await createDossier({
      type: parsed.data.type,
      concessionnaireId: parsed.data.concessionnaireId,
      payload: {
        produitCode: parsed.data.payload.produitCode.trim().toUpperCase(),
        operationType: parsed.data.payload.operationType,
        dateEffet: parsed.data.payload.dateEffet,
        commentaire: parsed.data.payload.commentaire ?? null,
      },
      actor: auth.user,
    });
    return NextResponse.json({ dossier }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "ACTIVE_CONTRACT_EXISTS") {
      return NextResponse.json(
        { message: "Un contrat actif existe deja pour ce produit et ce concessionnaire." },
        { status: 409 },
      );
    }
    if (code === "CONCESSIONNAIRE_BLOQUE") {
      return NextResponse.json({ message: "Concessionnaire bloque (resilie ou decede)." }, { status: 409 });
    }
    if (code === "PRODUIT_INVALID") {
      return NextResponse.json({ message: "Produit invalide." }, { status: 400 });
    }
    if (code === "AGENCE_FORBIDDEN") {
      return NextResponse.json({ message: "Acces refuse pour cette agence." }, { status: 403 });
    }
    return NextResponse.json({ message: "Creation du dossier impossible." }, { status: 500 });
  }
}
