import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { zodBadRequest } from "@/lib/api/endpoint-helpers";
import {
  ensureCessionIndexes,
  getCessionById,
  patchCessionDocumentChecklist,
} from "@/lib/lonaci/cessions";
import { DOSSIER_CHECKLIST_STATUT_VALUES } from "@/lib/lonaci/produit-document-checklist";
import { requireApiAuth } from "@/lib/auth/guards";

const checklistPatchSchema = z.object({
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

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth(request, {
    roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE", "AUDITEUR"],
  });
  if ("error" in auth) return auth.error;

  const { id } = await context.params;
  await ensureCessionIndexes();
  const item = await getCessionById(id, auth.user);
  if (!item) {
    return NextResponse.json({ message: "Cession introuvable" }, { status: 404 });
  }
  return NextResponse.json({ item }, { status: 200 });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth(request, {
    roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
  });
  if ("error" in auth) return auth.error;

  const parsed = checklistPatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return zodBadRequest(parsed.error);
  }

  const { id } = await context.params;
  await ensureCessionIndexes();
  try {
    const item = await patchCessionDocumentChecklist({
      id,
      entries: parsed.data.documentChecklist,
      actor: auth.user,
    });
    return NextResponse.json({ item }, { status: 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Mise à jour impossible";
    if (msg === "CESSION_NOT_FOUND") {
      return NextResponse.json({ message: "Cession introuvable" }, { status: 404 });
    }
    if (msg === "CHECKLIST_NOT_SUPPORTED") {
      return NextResponse.json({ message: "Checklist non disponible pour ce type de dossier." }, { status: 400 });
    }
    return NextResponse.json({ message: msg }, { status: 400 });
  }
}
