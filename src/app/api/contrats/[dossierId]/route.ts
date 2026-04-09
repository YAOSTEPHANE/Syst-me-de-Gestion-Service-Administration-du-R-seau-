import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireApiAuth } from "@/lib/auth/guards";
import { updateContratById } from "@/lib/lonaci/contracts";

const patchSchema = z
  .object({
    dateEffet: z
      .string()
      .refine((s) => !Number.isNaN(Date.parse(s)), { message: "dateEffet invalide" })
      .optional(),
    status: z.enum(["ACTIF", "RESILIE", "CEDE"]).optional(),
    operationType: z.enum(["NOUVEAU", "ACTUALISATION"]).optional(),
  })
  .refine((v) => v.dateEffet !== undefined || v.status !== undefined || v.operationType !== undefined, {
    message: "Au moins un champ doit etre fourni",
  });

interface RouteContext {
  params: Promise<{ dossierId: string }>;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth(request, {
    roles: ["CHEF_SERVICE"],
  });
  if ("error" in auth) {
    return auth.error;
  }

  const { dossierId } = await context.params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "Donnees invalides", issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const contrat = await updateContratById({
      contratId: dossierId,
      actor: auth.user,
      dateEffet: parsed.data.dateEffet ? new Date(parsed.data.dateEffet) : undefined,
      status: parsed.data.status,
      operationType: parsed.data.operationType,
    });
    return NextResponse.json({ contrat }, { status: 200 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "CONTRAT_NOT_FOUND") {
      return NextResponse.json({ message: "Contrat introuvable." }, { status: 404 });
    }
    if (code === "AGENCE_FORBIDDEN") {
      return NextResponse.json({ message: "Acces refuse." }, { status: 403 });
    }
    if (code === "ACTIVE_CONTRACT_EXISTS") {
      return NextResponse.json(
        { message: "Impossible de passer ce contrat en ACTIF: un contrat actif existe deja pour ce produit." },
        { status: 409 },
      );
    }
    return NextResponse.json({ message: "Modification contrat impossible." }, { status: 500 });
  }
}
