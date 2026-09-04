import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { badRequest } from "@/lib/api/error-responses";
import { zodBadRequest } from "@/lib/api/endpoint-helpers";
import {
  getContratChecklistSettings,
  saveContratChecklistTemplate,
} from "@/lib/lonaci/contrat-checklist-settings";
import { normalizeChecklistTemplate } from "@/lib/lonaci/produit-document-checklist";
import { requireApiAuth } from "@/lib/auth/guards";

const checklistItemSchema = z.object({
  id: z.string().min(1).max(64).optional(),
  libelle: z.string().min(2).max(200),
  obligatoire: z.boolean().optional(),
});

const patchSchema = z.object({
  items: z.array(checklistItemSchema).min(1).max(50),
});

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, { roles: ["CHEF_SERVICE"] });
  if ("error" in auth) return auth.error;

  const settings = await getContratChecklistSettings();
  return NextResponse.json(
    {
      items: settings.items,
      isDefault: settings.isDefault,
      updatedAt: settings.updatedAt?.toISOString() ?? null,
      updatedByUserId: settings.updatedByUserId,
    },
    { status: 200 },
  );
}

export async function PATCH(request: NextRequest) {
  const auth = await requireApiAuth(request, { roles: ["CHEF_SERVICE"] });
  if ("error" in auth) return auth.error;

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return zodBadRequest(parsed.error);
  }

  const items = normalizeChecklistTemplate(
    parsed.data.items.map((item, index) => ({
      id: item.id?.trim() || `contrat_doc_${index + 1}`,
      libelle: item.libelle.trim(),
      obligatoire: item.obligatoire !== false,
    })),
  );
  if (!items.length) {
    return badRequest("Au moins une pièce est requise.", "CHECKLIST_EMPTY");
  }

  try {
    const saved = await saveContratChecklistTemplate(items, auth.user);
    return NextResponse.json(
      {
        items: saved.items,
        isDefault: saved.isDefault,
        updatedAt: saved.updatedAt?.toISOString() ?? null,
        updatedByUserId: saved.updatedByUserId,
      },
      { status: 200 },
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "CHECKLIST_EMPTY") {
      return badRequest("Au moins une pièce est requise.", "CHECKLIST_EMPTY");
    }
    return NextResponse.json({ message: "Enregistrement impossible." }, { status: 500 });
  }
}
