import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { zodBadRequest } from "@/lib/api/endpoint-helpers";
import { requireApiAuth } from "@/lib/auth/guards";
import { ensureSuccessionIndexes, recordSuccessionValidationN2 } from "@/lib/lonaci/succession";

const schema = z.object({}).strict();

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return zodBadRequest(parsed.error);

  const auth = await requireApiAuth(request, {
    roles: ["ASSIST_CDS"],
    rbac: { resource: "DOSSIERS", action: "VALIDATE_N2" },
  });
  if ("error" in auth) return auth.error;

  const { id } = await context.params;
  await ensureSuccessionIndexes();
  try {
    const doc = await recordSuccessionValidationN2({ caseId: id, actor: auth.user });
    return NextResponse.json({ ok: true, caseId: doc._id }, { status: 200 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    const map: Record<string, number> = {
      CASE_NOT_FOUND: 404,
      CASE_ALREADY_CLOSED: 409,
      AGENCE_FORBIDDEN: 403,
      ROLE_FORBIDDEN: 403,
      SUCCESSION_VALIDATION_ALREADY_DONE: 409,
      SUCCESSION_VALIDATION_N1_REQUIRED: 400,
    };
    const status = map[code] ?? 500;
    return NextResponse.json({ message: code }, { status });
  }
}
