import { NextRequest, NextResponse } from "next/server";

import { conflict, notFound, serverError } from "@/lib/api/error-responses";
import { requireApiAuth } from "@/lib/auth/guards";
import { ensureSprint4Indexes, validateCautionN1 } from "@/lib/lonaci/sprint4";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth(request, {
    roles: ["CHEF_SECTION"],
    rbac: { resource: "CAUTIONS", action: "VALIDATE_N1" },
  });
  if ("error" in auth) return auth.error;

  const { id } = await context.params;
  await ensureSprint4Indexes();
  try {
    await validateCautionN1(id, auth.user);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "CAUTION_NOT_FOUND") return notFound("Caution introuvable.", "CAUTION_NOT_FOUND");
    if (code === "ROLE_FORBIDDEN" || code === "CAUTION_WRONG_STATUS") {
      return NextResponse.json({ message: "Transition non autorisee." }, { status: 403 });
    }
    if (code === "CAUTION_FICHE_PROVISOIRE") {
      return conflict(
        "Fiche provisoire : regularisez le paiement (mode et reference) avant validation N1.",
        "CAUTION_FICHE_PROVISOIRE",
      );
    }
    return serverError("Validation N1 impossible.", "CAUTION_VALIDATE_N1_FAILED");
  }
}
