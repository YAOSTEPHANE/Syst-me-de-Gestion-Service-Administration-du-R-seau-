import { NextRequest, NextResponse } from "next/server";

import { conflict, notFound, serverError } from "@/lib/api/error-responses";
import { requireApiAuth } from "@/lib/auth/guards";
import { ensureSprint4Indexes, validateCautionN2 } from "@/lib/lonaci/sprint4";
import { workflowStepRoles } from "@/lib/lonaci/workflow-approvals";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth(request, {
    roles: workflowStepRoles("ASSIST_CDS"),
    rbac: { resource: "CAUTIONS", action: "VALIDATE_N2" },
  });
  if ("error" in auth) return auth.error;

  const { id } = await context.params;
  await ensureSprint4Indexes();
  try {
    await validateCautionN2(id, auth.user);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "CAUTION_NOT_FOUND") return notFound("Caution introuvable.", "CAUTION_NOT_FOUND");
    if (code === "ROLE_FORBIDDEN") {
      return NextResponse.json({ message: "Transition non autorisee." }, { status: 403 });
    }
    if (code === "CAUTION_WRONG_STATUS") {
      return conflict("La caution n'est plus en attente de cette étape (déjà traitée ?).", "CAUTION_WRONG_STATUS");
    }
    if (code === "CAUTION_IMMUTABLE") {
      return conflict("Caution deja finalisee (statut immuable).", "CAUTION_IMMUTABLE");
    }
    if (code === "CAUTION_FICHE_PROVISOIRE") {
      return conflict(
        "Fiche provisoire : regularisez le paiement avant poursuite du circuit.",
        "CAUTION_FICHE_PROVISOIRE",
      );
    }
    return serverError("Validation N2 impossible.", "CAUTION_VALIDATE_N2_FAILED");
  }
}
