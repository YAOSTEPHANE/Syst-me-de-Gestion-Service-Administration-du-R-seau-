import { NextRequest, NextResponse } from "next/server";

import { canReadConcessionnaire } from "@/lib/lonaci/access";
import { findConcessionnaireById } from "@/lib/lonaci/concessionnaires";
import { ensureSuccessionIndexes, findSuccessionCaseById } from "@/lib/lonaci/succession";
import { requireApiAuth } from "@/lib/auth/guards";
import { createSuccessionReadStream } from "@/lib/storage/succession-files";

interface RouteContext {
  params: Promise<{ id: string; documentId: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth(request, {
    roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
  });
  if ("error" in auth) return auth.error;

  const { id, documentId } = await context.params;
  await ensureSuccessionIndexes();
  const doc = await findSuccessionCaseById(id);
  if (!doc) {
    return NextResponse.json({ message: "CASE_NOT_FOUND" }, { status: 404 });
  }

  const conc = await findConcessionnaireById(doc.concessionnaireId);
  if (!conc || conc.deletedAt) {
    return NextResponse.json({ message: "CONCESSIONNAIRE_NOT_FOUND" }, { status: 404 });
  }
  if (!canReadConcessionnaire(auth.user, conc)) {
    return NextResponse.json({ message: "AGENCE_FORBIDDEN" }, { status: 403 });
  }

  const file = doc.documents.find((d) => d.id === documentId);
  if (!file) {
    return NextResponse.json({ message: "DOCUMENT_NOT_FOUND" }, { status: 404 });
  }

  const nodeStream = createSuccessionReadStream(file.storedRelativePath);
  const stream = new ReadableStream({
    start(controller) {
      nodeStream.on("data", (chunk) => controller.enqueue(chunk));
      nodeStream.on("end", () => controller.close());
      nodeStream.on("error", (error) => controller.error(error));
    },
    cancel() {
      nodeStream.destroy();
    },
  });

  return new NextResponse(stream, {
    status: 200,
    headers: {
      "Content-Type": file.mimeType,
      "Content-Length": String(file.size),
      "Content-Disposition": `inline; filename="${file.filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
