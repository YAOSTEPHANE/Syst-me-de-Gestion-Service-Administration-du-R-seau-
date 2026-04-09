import { NextRequest, NextResponse } from "next/server";

import { canReadCessionScopeForUser } from "@/lib/lonaci/access";
import { ensureCessionIndexes, getCessionAttachmentWithScope } from "@/lib/lonaci/cessions";
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
  const row = await getCessionAttachmentWithScope({ id, attachmentId });
  if (!row) {
    return NextResponse.json({ message: "Document introuvable." }, { status: 404 });
  }
  const allowed = await canReadCessionScopeForUser(auth.user, {
    concessionnaireId: row.concessionnaireId,
    cedantId: row.cedantId,
    beneficiaireId: row.beneficiaireId,
  });
  if (!allowed) {
    return NextResponse.json({ message: "Acces refuse." }, { status: 403 });
  }
  const { attachment } = row;
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

