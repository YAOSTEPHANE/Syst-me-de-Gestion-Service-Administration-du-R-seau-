import { NextRequest, NextResponse } from "next/server";

import {
  ensureSuccessionIndexes,
  findVisibleSuccessionCaseById,
} from "@/lib/lonaci/succession";
import { requireApiAuth } from "@/lib/auth/guards";
import { createSuccessionReadStream } from "@/lib/storage/succession-files";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth(request, {
    roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
  });
  if ("error" in auth) return auth.error;

  const { id } = await context.params;
  await ensureSuccessionIndexes();
  const doc = await findVisibleSuccessionCaseById(id, auth.user);
  if (!doc) {
    return NextResponse.json({ message: "CASE_NOT_FOUND" }, { status: 404 });
  }
  if (!doc.acteDeces) {
    return NextResponse.json({ message: "ACTE_DECES_NOT_FOUND" }, { status: 404 });
  }

  const nodeStream = createSuccessionReadStream(doc.acteDeces.storedRelativePath);
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
      "Content-Type": doc.acteDeces.mimeType,
      "Content-Length": String(doc.acteDeces.size),
      "Content-Disposition": `inline; filename="${doc.acteDeces.filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
