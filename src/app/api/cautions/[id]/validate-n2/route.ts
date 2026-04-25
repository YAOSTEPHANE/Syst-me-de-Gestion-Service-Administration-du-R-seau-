import { NextRequest, NextResponse } from "next/server";

import { notFound, serverError } from "@/lib/api/error-responses";
import { requireApiAuth } from "@/lib/auth/guards";
import { ensureSprint4Indexes, validateCautionN2 } from "@/lib/lonaci/sprint4";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth(request, {
    roles: ["ASSIST_CDS"],
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
    if (code === "ROLE_FORBIDDEN" || code === "CAUTION_WRONG_STATUS") {
      return NextResponse.json({ message: "Transition non autorisee." }, { status: 403 });
    }
    return serverError("Validation N2 impossible.", "CAUTION_VALIDATE_N2_FAILED");
  }
}
