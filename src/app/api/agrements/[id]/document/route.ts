import { NextRequest, NextResponse } from "next/server";

import { ensureAgrementsIndexes, getAgrementDocumentMeta } from "@/lib/lonaci/agrements";
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

