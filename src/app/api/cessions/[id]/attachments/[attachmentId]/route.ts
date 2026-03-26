import { NextRequest, NextResponse } from "next/server";

import { ensureCessionIndexes, getCessionAttachment } from "@/lib/lonaci/cessions";
import { requireApiAuth } from "@/lib/auth/guards";
import { createCessionReadStream } from "@/lib/storage/cessions-files";

interface RouteContext {
  params: Promise<{ id: string; attachmentId: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth(request, { roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"] });
  if ("error" in auth) return auth.error;
  const { id, attachmentId } = await context.params;
  await ensureCessionIndexes();
  const attachment = await getCessionAttachment({ id, attachmentId });
  if (!attachment) {
    return NextResponse.json({ message: "Document introuvable." }, { status: 404 });
  }
  const stream = createCessionReadStream(attachment.storedRelativePath);
  return new NextResponse(stream as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": attachment.mimeType || "application/octet-stream",
      "Content-Disposition": `inline; filename="${attachment.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

