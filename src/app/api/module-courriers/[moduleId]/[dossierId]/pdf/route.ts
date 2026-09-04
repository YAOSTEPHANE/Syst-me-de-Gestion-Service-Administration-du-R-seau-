import { NextRequest } from "next/server";

import { badRequest } from "@/lib/api/error-responses";
import { requireApiAuth } from "@/lib/auth/guards";
import { respondModuleCourrierPdf } from "@/lib/lonaci/module-courrier-pdf-route";
import { isModuleCourrierId } from "@/lib/lonaci/module-courrier-types";

interface RouteContext {
  params: Promise<{ moduleId: string; dossierId: string }>;
}

const COURRIER_ROLES = ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE", "AUDITEUR"] as const;

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth(request, { roles: [...COURRIER_ROLES] });
  if ("error" in auth) return auth.error;

  const { moduleId, dossierId } = await context.params;
  if (!isModuleCourrierId(moduleId)) {
    return badRequest("Module courrier inconnu.", "MODULE_COURRIER_UNKNOWN");
  }

  try {
    return await respondModuleCourrierPdf(request, moduleId, dossierId, auth.user);
  } catch {
    return Response.json({ message: "Génération PDF impossible." }, { status: 500 });
  }
}
