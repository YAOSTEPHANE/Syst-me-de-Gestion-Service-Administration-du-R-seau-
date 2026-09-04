import { NextRequest, NextResponse } from "next/server";

import { buildModuleCourrierView } from "@/lib/lonaci/module-courrier-build";
import type { ModuleCourrierId } from "@/lib/lonaci/module-courrier-types";
import { renderModuleCourrierPdf } from "@/lib/pdf/module-courrier";
import type { UserDocument } from "@/lib/lonaci/types";

export async function respondModuleCourrierPdf(
  request: NextRequest,
  moduleId: ModuleCourrierId,
  dossierId: string,
  actor: UserDocument,
): Promise<NextResponse> {
  const view = await buildModuleCourrierView(moduleId, dossierId, actor);
  if (!view) {
    return NextResponse.json({ message: "Dossier introuvable ou courrier indisponible." }, { status: 404 });
  }
  const pdf = await renderModuleCourrierPdf(view);
  const filename = `courrier-${moduleId}-${view.reference.replace(/[^\w-]+/g, "_")}.pdf`;
  const inline = request.nextUrl.searchParams.get("view") === "1";
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
