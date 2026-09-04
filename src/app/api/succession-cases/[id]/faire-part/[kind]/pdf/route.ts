import { NextRequest, NextResponse } from "next/server";

import { requireApiAuth } from "@/lib/auth/guards";
import { buildFairePartView } from "@/lib/lonaci/module-faire-part-build";
import { isFairePartKind } from "@/lib/lonaci/module-faire-part-types";
import { fairePartDownloadFilename } from "@/lib/lonaci/module-faire-part-url";
import { logPdfFailure } from "@/lib/observability/workflow-events";
import { renderModuleCourrierPdf } from "@/lib/pdf/module-courrier";

interface RouteContext {
  params: Promise<{ id: string; kind: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth(request);
  if ("error" in auth) return auth.error;

  const { id, kind: rawKind } = await context.params;
  if (!isFairePartKind(rawKind)) {
    return NextResponse.json({ message: "Type de faire-part inconnu." }, { status: 400 });
  }

  try {
    const view = await buildFairePartView(id, auth.user, rawKind);
    if (!view) {
      return NextResponse.json(
        { message: "Dossier introuvable ou faire-part indisponible." },
        { status: 404 },
      );
    }
    const pdf = await renderModuleCourrierPdf(view);
    const filename = fairePartDownloadFilename(view.reference, rawKind);
    const inline = request.nextUrl.searchParams.get("view") === "1";
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "FAIRE_PART_AYANT_DROIT_REQUIRED") {
      return NextResponse.json(
        {
          message:
            "Identifiez d'abord l'ayant droit (étape 18) pour générer la demande de faire-part.",
          code: "FAIRE_PART_AYANT_DROIT_REQUIRED",
        },
        { status: 400 },
      );
    }
    logPdfFailure({
      document: `faire-part-${rawKind}`,
      code,
      entityId: id,
      detail: error instanceof Error ? error.message : null,
    });
    return NextResponse.json({ message: "Génération du faire-part impossible." }, { status: 500 });
  }
}
