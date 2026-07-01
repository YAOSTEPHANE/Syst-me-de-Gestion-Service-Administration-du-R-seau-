import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { zodBadRequest } from "@/lib/api/endpoint-helpers";
import { friendlyErrorMessage } from "@/lib/lonaci/friendly-messages";
import { isWorkflowSeparationError } from "@/lib/lonaci/workflow-separation";
import { finalizeDossierContratActualisation } from "@/lib/lonaci/dossier-contrat-finalize";
import { ensureDossierIndexes, findDossierById, transitionDossier } from "@/lib/lonaci/dossiers";
import { requireApiAuth } from "@/lib/auth/guards";

const transitionSchema = z.object({
  action: z.enum([
    "SUBMIT",
    "VALIDATE_N1",
    "VALIDATE_N2",
    "FINALIZE",
    "REJECT",
    "RETURN_PREVIOUS",
    "REJECT_TO_DRAFT",
  ]),
  comment: z.string().max(2000).nullable().optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

function toRbacAction(action: z.infer<typeof transitionSchema>["action"]) {
  switch (action) {
    case "VALIDATE_N1":
      return "VALIDATE_N1" as const;
    case "VALIDATE_N2":
      return "VALIDATE_N2" as const;
    case "FINALIZE":
      return "FINALIZE" as const;
    case "REJECT":
      return "REJECT" as const;
    case "RETURN_PREVIOUS":
    case "REJECT_TO_DRAFT":
      return "RETURN_FOR_CORRECTION" as const;
    default:
      return "UPDATE" as const;
  }
}

function toTargetStatus(action: z.infer<typeof transitionSchema>["action"]) {
  switch (action) {
    case "SUBMIT":
      return "SOUMIS";
    case "VALIDATE_N1":
      return "VALIDE_N1";
    case "VALIDATE_N2":
      return "VALIDE_N2";
    case "FINALIZE":
      return "FINALISE";
    case "REJECT":
      // Règles métier : après un rejet, le dossier revient au brouillon.
      return "BROUILLON";
    case "RETURN_PREVIOUS":
      return "BROUILLON";
    case "REJECT_TO_DRAFT":
      return "BROUILLON";
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const parsed = transitionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return zodBadRequest(parsed.error);
  }

  const auth = await requireApiAuth(request, {
    roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
    rbac: { resource: "DOSSIERS", action: toRbacAction(parsed.data.action) },
  });
  if ("error" in auth) {
    return auth.error;
  }
  const { id } = await context.params;

  await ensureDossierIndexes();
  const before = await findDossierById(id);
  if (!before || before.deletedAt) {
    return NextResponse.json({ message: "Dossier introuvable" }, { status: 404 });
  }

  if (
    (parsed.data.action === "REJECT" ||
      parsed.data.action === "RETURN_PREVIOUS" ||
      parsed.data.action === "REJECT_TO_DRAFT") &&
    !parsed.data.comment?.trim()
  ) {
    return NextResponse.json({ message: "Motif/commentaire obligatoire pour cette action." }, { status: 400 });
  }

  if (parsed.data.action === "RETURN_PREVIOUS") {
    let previousTarget:
      | "BROUILLON"
      | "SOUMIS"
      | "VALIDE_N1" = "BROUILLON";
    if (before.status === "VALIDE_N2") {
      previousTarget = "VALIDE_N1";
    } else if (before.status === "VALIDE_N1") {
      previousTarget = "SOUMIS";
    } else {
      previousTarget = "BROUILLON";
    }
    try {
      const dossier = await transitionDossier(id, previousTarget, auth.user, parsed.data.comment ?? null);
      return NextResponse.json({ dossier }, { status: 200 });
    } catch (error) {
      const code = error instanceof Error ? error.message : "UNKNOWN";
      if (code === "ROLE_FORBIDDEN" || code === "AGENCE_FORBIDDEN" || isWorkflowSeparationError(code)) {
        return NextResponse.json(
          { message: friendlyErrorMessage(code), code },
          { status: 403 },
        );
      }
      if (code === "INVALID_TRANSITION") {
        return NextResponse.json({ message: "Transition de statut invalide." }, { status: 409 });
      }
      return NextResponse.json({ message: "Transition impossible." }, { status: 500 });
    }
  }

  const target = toTargetStatus(parsed.data.action);
  try {
    if (parsed.data.action === "FINALIZE" && before.type === "CONTRAT_ACTUALISATION") {
      const finalized = await finalizeDossierContratActualisation({
        dossierId: id,
        actor: auth.user,
        comment: parsed.data.comment ?? null,
      });
      if (!finalized.ok) {
        return NextResponse.json({ message: finalized.message }, { status: finalized.httpStatus });
      }
      return NextResponse.json(
        { dossier: finalized.dossier, contrat: finalized.contrat },
        { status: 200 },
      );
    }

    const dossier = await transitionDossier(id, target, auth.user, parsed.data.comment ?? null);
    return NextResponse.json({ dossier }, { status: 200 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "ROLE_FORBIDDEN" || code === "AGENCE_FORBIDDEN" || isWorkflowSeparationError(code)) {
      return NextResponse.json(
        { message: friendlyErrorMessage(code), code },
        { status: 403 },
      );
    }
    if (code === "CONCESSIONNAIRE_BLOQUE") {
      return NextResponse.json({ message: "Concessionnaire bloque." }, { status: 409 });
    }
    if (code === "ACTIVE_CONTRACT_EXISTS") {
      return NextResponse.json(
        { message: "Un contrat actif existe deja pour ce produit et ce concessionnaire." },
        { status: 409 },
      );
    }
    if (code === "INVALID_TRANSITION") {
      return NextResponse.json({ message: "Transition de statut invalide." }, { status: 409 });
    }
    if (code === "DOSSIER_CHECKLIST_INCOMPLETE") {
      return NextResponse.json(
        {
          message:
            "Soumission impossible : la checklist documents doit être complète (tous les documents obligatoires en statut « Fourni »).",
        },
        { status: 409 },
      );
    }
    if (code === "DOSSIER_NOT_FOUND") {
      return NextResponse.json({ message: "Dossier introuvable." }, { status: 404 });
    }
    return NextResponse.json({ message: "Transition impossible." }, { status: 500 });
  }
}
