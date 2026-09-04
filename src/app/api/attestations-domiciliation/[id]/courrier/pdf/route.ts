import { NextRequest } from "next/server";

import { respondModuleCourrierPdf } from "@/lib/lonaci/module-courrier-pdf-route";
import { requireApiAuth } from "@/lib/auth/guards";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth(request, {
    roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE", "AUDITEUR"],
  });
  if ("error" in auth) return auth.error;

  const { id } = await context.params;
  try {
    return await respondModuleCourrierPdf(request, "attestation-domiciliation", id, auth.user);
  } catch {
    return Response.json({ message: "Génération PDF impossible." }, { status: 500 });
  }
}
