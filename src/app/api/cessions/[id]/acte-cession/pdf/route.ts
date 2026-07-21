import { NextRequest, NextResponse } from "next/server";

import { notFound, serverError } from "@/lib/api/error-responses";
import { buildActeCessionView, renderActeCessionPdf } from "@/lib/lonaci/acte-cession";
import {
  ensureCessionIndexes,
  getCessionById,
  markActeCessionGenere,
} from "@/lib/lonaci/cessions";
import { requireApiAuth } from "@/lib/auth/guards";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** Génère l’acte officiel de cession au format PDF. */
export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth(request, {
    roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE", "AUDITEUR"],
  });
  if ("error" in auth) return auth.error;

  const { id } = await context.params;
  await ensureCessionIndexes();

  try {
    const visible = await getCessionById(id, auth.user);
    if (!visible || (visible.kind !== "CESSION" && visible.kind !== "CESSION_DELOCALISATION")) {
      return notFound("Demande de cession introuvable.", "ACTE_CESSION_NOT_FOUND");
    }
    const view = await buildActeCessionView(id);
    if (!view) {
      return notFound("Demande de cession introuvable.", "ACTE_CESSION_NOT_FOUND");
    }
    const pdf = await renderActeCessionPdf(view);
    await markActeCessionGenere(id);
    const filename = `acte-cession-${view.reference.replace(/[^\w-]+/g, "_")}.pdf`;
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return serverError("Génération de l'acte de cession impossible.", "ACTE_CESSION_PDF_FAILED");
  }
}
