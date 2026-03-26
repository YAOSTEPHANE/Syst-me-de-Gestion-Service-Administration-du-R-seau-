import { NextRequest, NextResponse } from "next/server";
import { Readable } from "node:stream";

import { createResiliationAttachmentStream, getResiliationAttachment } from "@/lib/lonaci/resiliations";
import { requireApiAuth } from "@/lib/auth/guards";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string; attachmentId: string }> },
) {
  const auth = await requireApiAuth(request, {
    roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
  });
  if ("error" in auth) return auth.error;

  const { id, attachmentId } = await context.params;
  const attachment = await getResiliationAttachment({ id, attachmentId });
  if (!attachment) {
    return NextResponse.json({ message: "Pièce jointe introuvable." }, { status: 404 });
  }

  const stream = createResiliationAttachmentStream(attachment.storedRelativePath);
  const web = Readable.toWeb(stream) as ReadableStream<Uint8Array>;
  return new NextResponse(web, {
    status: 200,
    headers: {
      "Content-Type": attachment.mimeType || "application/octet-stream",
      "Content-Disposition": `inline; filename="${encodeURIComponent(attachment.filename)}"`,
    },
  });
}

