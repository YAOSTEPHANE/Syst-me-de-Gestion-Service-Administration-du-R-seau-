import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { badRequest } from "@/lib/api/error-responses";
import { zodBadRequest } from "@/lib/api/endpoint-helpers";
import {
  getFairePartSettings,
  saveFairePartTemplate,
} from "@/lib/lonaci/module-faire-part-settings";
import { requireApiAuth } from "@/lib/auth/guards";

const patchSchema = z.object({
  destinataire: z.string().min(2).max(2000),
  objet: z.string().min(2).max(300),
  corps: z.string().min(10).max(12000),
  signatureLabel: z.string().min(2).max(120),
});

/** Compat : ancienne URL admin = faire-part kind « demande ». */
export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, { roles: ["CHEF_SERVICE"] });
  if ("error" in auth) return auth.error;

  const settings = await getFairePartSettings("demande");
  return NextResponse.json(
    {
      kind: settings.kind,
      template: settings.template,
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

  try {
    const saved = await saveFairePartTemplate(
      "demande",
      {
        destinataire: parsed.data.destinataire.trim(),
        objet: parsed.data.objet.trim(),
        corps: parsed.data.corps.trim(),
        signatureLabel: parsed.data.signatureLabel.trim(),
      },
      auth.user,
    );
    return NextResponse.json(
      {
        kind: saved.kind,
        template: saved.template,
        isDefault: saved.isDefault,
        updatedAt: saved.updatedAt?.toISOString() ?? null,
        updatedByUserId: saved.updatedByUserId,
      },
      { status: 200 },
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "FAIRE_PART_TEMPLATE_INVALID") {
      return badRequest("Modèle de faire-part invalide.", "FAIRE_PART_TEMPLATE_INVALID");
    }
    return NextResponse.json({ message: "Enregistrement impossible." }, { status: 500 });
  }
}
