import { NextRequest, NextResponse } from "next/server";

import { canReadConcessionnaire, userMatchesAgence } from "@/lib/lonaci/access";
import { ensureAgrementsIndexes, getAgrementDocumentMeta } from "@/lib/lonaci/agrements";
import { findConcessionnaireById } from "@/lib/lonaci/concessionnaires";
import { requireApiAuth } from "@/lib/auth/guards";
import { createAgrementReadStream } from "@/lib/storage/agrements-files";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth(request, { roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"] });
  if ("error" in auth) return auth.error;
  const { id } = await context.params;
  await ensureAgrementsIndexes();
  const meta = await getAgrementDocumentMeta(id);
  if (!meta) {
    return NextResponse.json({ message: "Document introuvable." }, { status: 404 });
  }

  if (meta.concessionnaireId) {
    const concessionnaire = await findConcessionnaireById(meta.concessionnaireId);
    if (!concessionnaire || concessionnaire.deletedAt) {
      return NextResponse.json({ message: "Document introuvable." }, { status: 404 });
    }
    if (!canReadConcessionnaire(auth.user, concessionnaire)) {
      return NextResponse.json({ message: "Acces refuse." }, { status: 403 });
    }
  } else if (!userMatchesAgence(auth.user, meta.agenceId)) {
    return NextResponse.json({ message: "Acces refuse." }, { status: 403 });
  }

  const stream = createAgrementReadStream(meta.storedRelativePath);
  return new NextResponse(stream as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": meta.mimeType || "application/pdf",
      "Content-Disposition": `inline; filename="${meta.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

