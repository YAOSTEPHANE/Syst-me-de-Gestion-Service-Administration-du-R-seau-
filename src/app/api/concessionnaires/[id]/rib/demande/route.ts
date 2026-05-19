import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { zodBadRequest } from "@/lib/api/endpoint-helpers";
import { requireApiAuth } from "@/lib/auth/guards";
import { ribWorkflowErrorResponse } from "@/lib/lonaci/rib-api-errors";
import { createRibDemande } from "@/lib/lonaci/rib-bancarisation";
import { sanitizeConcessionnairePublic } from "@/lib/lonaci/concessionnaires";
import { sanitizeRibWorkflowPublic } from "@/lib/lonaci/rib-bancarisation";

const bodySchema = z.object({
  notifyEmail: z.boolean().optional().default(true),
  notifySms: z.boolean().optional().default(true),
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
    const result = await createRibDemande({
      concessionnaireId: id,
      actor: auth.user,
      notifyEmail: parsed.data.notifyEmail,
      notifySms: parsed.data.notifySms,
    });
    return NextResponse.json({
      concessionnaire: sanitizeConcessionnairePublic(result.concessionnaire),
      rib: sanitizeRibWorkflowPublic(result.concessionnaire),
      notify: result.notify,
    });
  } catch (err) {
    return ribWorkflowErrorResponse(err);
  }
}
