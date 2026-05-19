import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { zodBadRequest } from "@/lib/api/endpoint-helpers";
import { requireApiAuth } from "@/lib/auth/guards";
import { sanitizeConcessionnairePublic } from "@/lib/lonaci/concessionnaires";
import { ribWorkflowErrorResponse } from "@/lib/lonaci/rib-api-errors";
import { sanitizeRibWorkflowPublic, validateRib } from "@/lib/lonaci/rib-bancarisation";

const bodySchema = z.object({
  compteBancaire: z.union([z.string().max(128), z.null()]).optional(),
  banqueEtablissement: z.union([z.string().max(200), z.null()]).optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth(request, {
    roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
  });
  if ("error" in auth) return auth.error;

  const { id } = await context.params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return zodBadRequest(parsed.error, "Corps de requête invalide");
  }

  try {
    const updated = await validateRib({
      concessionnaireId: id,
      compteBancaire: parsed.data.compteBancaire,
      banqueEtablissement: parsed.data.banqueEtablissement,
      actor: auth.user,
    });
    return NextResponse.json({
      concessionnaire: sanitizeConcessionnairePublic(updated),
      rib: sanitizeRibWorkflowPublic(updated),
    });
  } catch (err) {
    return ribWorkflowErrorResponse(err);
  }
}
