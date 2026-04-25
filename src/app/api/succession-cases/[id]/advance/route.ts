import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { zodBadRequest } from "@/lib/api/endpoint-helpers";
import { advanceSuccessionCase, ensureSuccessionIndexes } from "@/lib/lonaci/succession";
import { checkPermission } from "@/lib/auth/checkPermission";

const schema = z.object({
  comment: z.string().max(5000).nullable().optional(),
  ayantDroitNom: z.string().min(2).max(200).optional(),
  ayantDroitLienParente: z.string().max(120).optional(),
  ayantDroitTelephone: z.string().max(32).optional(),
  ayantDroitEmail: z.union([z.string().email(), z.literal("")]).optional(),
  decisionType: z.enum(["TRANSFERT", "RESILIATION"]).optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return zodBadRequest(parsed.error);
  }
  const auth = await checkPermission(request, {
    roles: ["CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
    resource: "DOSSIERS",
    action: parsed.data.decisionType ? "FINALIZE" : "UPDATE",
  });
  if ("error" in auth) return auth.error;
  const { id } = await context.params;

  await ensureSuccessionIndexes();
  try {
    const doc = await advanceSuccessionCase({
      caseId: id,
      comment: parsed.data.comment ?? null,
      ayantDroitNom: parsed.data.ayantDroitNom,
      ayantDroitLienParente: parsed.data.ayantDroitLienParente,
      ayantDroitTelephone: parsed.data.ayantDroitTelephone,
      ayantDroitEmail: parsed.data.ayantDroitEmail === "" ? null : parsed.data.ayantDroitEmail,
      decisionType: parsed.data.decisionType,
      actor: auth.user,
    });
    return NextResponse.json(
      {
        case: {
          id: doc._id,
          reference: doc.reference,
          status: doc.status,
          stepHistory: doc.stepHistory.map((s) => ({
            ...s,
            completedAt: s.completedAt.toISOString(),
          })),
        },
      },
      { status: 200 },
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    const map: Record<string, number> = {
      CASE_NOT_FOUND: 404,
      CASE_ALREADY_CLOSED: 409,
      ALL_STEPS_DONE: 409,
      AGENCE_FORBIDDEN: 403,
      ROLE_FORBIDDEN: 403,
      AYANT_DROIT_NOM_REQUIRED: 400,
      AYANT_DROIT_LIEN_REQUIRED: 400,
      AYANT_DROIT_CONTACT_REQUIRED: 400,
      DECISION_CHEF_SERVICE_ONLY: 403,
      DECISION_TYPE_REQUIRED: 400,
      SUCCESSION_DOCUMENTS_REQUIRED: 400,
      SUCCESSION_STEPS_INCOMPLETE: 409,
      SUCCESSION_VALIDATION_N1_N2_REQUIRED: 409,
      TRANSFER_SOURCE_CONTRACT_NOT_FOUND: 409,
      CONCESSIONNAIRE_NOT_FOUND: 404,
      CONCESSIONNAIRE_UPDATE_FAILED: 500,
    };
    const status = map[code] ?? 500;
    return NextResponse.json(
      { message: code === "UNKNOWN" ? "Avancement impossible" : code },
      { status },
    );
  }
}
