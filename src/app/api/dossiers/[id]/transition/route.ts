import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { finalizeContratFromDossier, hasActiveContractForProduct } from "@/lib/lonaci/contracts";
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
  const auth = await requireApiAuth(request, {
    roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
  });
  if ("error" in auth) {
    return auth.error;
  }
  const { id } = await context.params;
  const parsed = transitionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "Donnees invalides", issues: parsed.error.issues }, { status: 400 });
  }

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
      if (code === "ROLE_FORBIDDEN" || code === "AGENCE_FORBIDDEN") {
        return NextResponse.json({ message: "Acces refuse." }, { status: 403 });
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
      const produitCode = String(before.payload.produitCode ?? "").trim().toUpperCase();
      const operationType = String(before.payload.operationType ?? "");
      const dateEffetRaw = String(before.payload.dateEffet ?? "");
      const dateEffet = new Date(dateEffetRaw);
      if (!produitCode || !operationType || Number.isNaN(dateEffet.getTime())) {
        return NextResponse.json({ message: "Payload dossier contrat invalide." }, { status: 400 });
      }
      if (operationType === "NOUVEAU") {
        const hasActive = await hasActiveContractForProduct(before.concessionnaireId, produitCode);
        if (hasActive) {
          return NextResponse.json(
            { message: "Un contrat actif existe deja pour ce produit et ce concessionnaire." },
            { status: 409 },
          );
        }
      }
      await transitionDossier(id, target, auth.user, parsed.data.comment ?? null);
      const contrat = await finalizeContratFromDossier({
        dossierId: id,
        concessionnaireId: before.concessionnaireId,
        produitCode,
        operationType: operationType === "ACTUALISATION" ? "ACTUALISATION" : "NOUVEAU",
        dateEffet,
        actor: auth.user,
      });
      const dossier = await findDossierById(id);
      return NextResponse.json({ dossier, contrat }, { status: 200 });
    }

    const dossier = await transitionDossier(id, target, auth.user, parsed.data.comment ?? null);
    return NextResponse.json({ dossier }, { status: 200 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "ROLE_FORBIDDEN" || code === "AGENCE_FORBIDDEN") {
      return NextResponse.json({ message: "Acces refuse." }, { status: 403 });
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
    if (code === "DOSSIER_NOT_FOUND") {
      return NextResponse.json({ message: "Dossier introuvable." }, { status: 404 });
    }
    return NextResponse.json({ message: "Transition impossible." }, { status: 500 });
  }
}
