import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { zodBadRequest } from "@/lib/api/endpoint-helpers";
import { canReadConcessionnaire } from "@/lib/lonaci/access";
import { findConcessionnaireById } from "@/lib/lonaci/concessionnaires";
import { DOSSIER_CHECKLIST_STATUT_VALUES } from "@/lib/lonaci/produit-document-checklist";
import { ensureSuccessionIndexes, findSuccessionCaseById, patchSuccessionDocumentChecklist } from "@/lib/lonaci/succession";
import { requireApiAuth } from "@/lib/auth/guards";

const patchSchema = z.object({
  documentChecklist: z
    .array(
      z.object({
        itemId: z.string().min(1),
        statut: z.enum(DOSSIER_CHECKLIST_STATUT_VALUES),
      }),
    )
    .min(1),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** §10.1 — Mise à jour des statuts de la checklist documentaire. */
export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth(request, {
    roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
  });
  if ("error" in auth) return auth.error;

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return zodBadRequest(parsed.error);
  }

  const { id } = await context.params;
  await ensureSuccessionIndexes();

  const existing = await findSuccessionCaseById(id);
  if (!existing) {
    return NextResponse.json({ message: "CASE_NOT_FOUND" }, { status: 404 });
  }
  const conc = await findConcessionnaireById(existing.concessionnaireId);
  if (!conc || conc.deletedAt) {
    return NextResponse.json({ message: "CONCESSIONNAIRE_NOT_FOUND" }, { status: 404 });
  }
  if (!canReadConcessionnaire(auth.user, conc)) {
    return NextResponse.json({ message: "AGENCE_FORBIDDEN" }, { status: 403 });
  }

  try {
    const updated = await patchSuccessionDocumentChecklist({
      caseId: id,
      entries: parsed.data.documentChecklist,
      actor: auth.user,
    });
    return NextResponse.json(
      {
        case: {
          id: updated._id,
          documentChecklist: updated.documentChecklist,
          checklistComplet: updated.documentChecklist?.complet ?? false,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "CASE_ALREADY_CLOSED") {
      return NextResponse.json({ message: "Dossier clôturé — checklist non modifiable." }, { status: 400 });
    }
    if (code === "CASE_NOT_FOUND") {
      return NextResponse.json({ message: "Dossier introuvable." }, { status: 404 });
    }
    return NextResponse.json({ message: "Mise à jour checklist impossible." }, { status: 500 });
  }
}
