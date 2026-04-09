import { NextRequest, NextResponse } from "next/server";
import { Readable } from "node:stream";

import { canReadConcessionnaire } from "@/lib/lonaci/access";
import { findConcessionnaireById } from "@/lib/lonaci/concessionnaires";
import { createResiliationAttachmentStream, getResiliationAttachmentWithConcessionnaire } from "@/lib/lonaci/resiliations";
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
  const pack = await getResiliationAttachmentWithConcessionnaire({ id, attachmentId });
  if (!pack) {
    return NextResponse.json({ message: "Pièce jointe introuvable." }, { status: 404 });
  }
  const { attachment, concessionnaireId } = pack;
  const concessionnaire = await findConcessionnaireById(concessionnaireId);
  if (!concessionnaire || concessionnaire.deletedAt || !canReadConcessionnaire(auth.user, concessionnaire)) {
    return NextResponse.json({ message: "Acces refuse." }, { status: 403 });
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

