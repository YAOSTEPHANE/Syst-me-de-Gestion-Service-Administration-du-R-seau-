import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { badRequest, notFound } from "@/lib/api/error-responses";
import { zodBadRequest } from "@/lib/api/endpoint-helpers";
import {
  ensureResiliationIndexes,
  transitionResiliation,
  type ResiliationStatus,
} from "@/lib/lonaci/resiliations";
import { checkPermission, resolveRbacAction } from "@/lib/auth/checkPermission";

const schema = z
  .object({
    target: z.enum(["DOSSIER_RECU", "CONTROLE_CHEF_SECTION", "VALIDATION_N2", "RESILIE", "REJETEE"]),
    confirmIrreversible: z.literal(true).optional(),
    commentaire: z.string().max(10000).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.target === "RESILIE" && v.confirmIrreversible !== true) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Confirmation explicite requise pour finaliser la résiliation.",
      });
    }
  });

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return zodBadRequest(parsed.error);
  }

  const rbacAction = resolveRbacAction(parsed.data.target, {
    CONTROLE_CHEF_SECTION: "VALIDATE_N1",
    VALIDATION_N2: "VALIDATE_N2",
    RESILIE: "FINALIZE",
    REJETEE: "REJECT",
    DOSSIER_RECU: "UPDATE",
  });

  const auth = await checkPermission(request, {
    roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
    resource: "DOSSIERS",
    action: rbacAction,
  });
  if ("error" in auth) return auth.error;

  const { id } = await context.params;
  await ensureResiliationIndexes();

  try {
    await transitionResiliation({
      id,
      target: parsed.data.target as ResiliationStatus,
      confirmIrreversible: parsed.data.confirmIrreversible,
      commentaire: parsed.data.commentaire ?? null,
      actor: auth.user,
    });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    const code = e instanceof Error ? e.message : "UNKNOWN";
    if (code === "RESILIATION_NOT_FOUND") {
      return notFound("Dossier de résiliation introuvable.", "RESILIATION_NOT_FOUND");
    }
    if (code === "FORBIDDEN_TRANSITION") {
      return NextResponse.json({ message: "Transition interdite pour votre rôle" }, { status: 403 });
    }
    if (code === "INVALID_TRANSITION") {
      return badRequest("Transition invalide pour l'état actuel du dossier.", "INVALID_TRANSITION");
    }
    if (code === "RESILIATION_CONFIRMATION_REQUIRED") {
      return badRequest(
        "Confirmation explicite requise : la résiliation est irréversible.",
        "RESILIATION_CONFIRMATION_REQUIRED",
      );
    }
    if (code === "CHECKLIST_INCOMPLETE") {
      return badRequest(
        "Checklist incomplète — toutes les pièces obligatoires doivent être marquées « Fourni ».",
        "CHECKLIST_INCOMPLETE",
      );
    }
    if (code === "ACTIVE_CONTRAT_REQUIRED") {
      return badRequest(
        "Aucun contrat ACTIF à archiver pour ce produit.",
        "ACTIVE_CONTRAT_REQUIRED",
      );
    }
    return badRequest("Transition impossible.", "RESILIATION_TRANSITION_FAILED");
  }
}
