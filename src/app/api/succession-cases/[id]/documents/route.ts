import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

import { canReadConcessionnaire } from "@/lib/lonaci/access";
import { findConcessionnaireById } from "@/lib/lonaci/concessionnaires";
import {
  addSuccessionDocument,
  ensureSuccessionIndexes,
  findSuccessionCaseById,
} from "@/lib/lonaci/succession";
import { requireApiAuth } from "@/lib/auth/guards";
import {
  MAX_SUCCESSION_FILE_BYTES,
  saveSuccessionDocument,
  SUCCESSION_ALLOWED_MIME,
} from "@/lib/storage/succession-files";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth(request, {
    roles: ["CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
  });
  if ("error" in auth) return auth.error;

  const { id } = await context.params;
  await ensureSuccessionIndexes();
  const successionCase = await findSuccessionCaseById(id);
  if (!successionCase) {
    return NextResponse.json({ message: "CASE_NOT_FOUND" }, { status: 404 });
  }
  const conc = await findConcessionnaireById(successionCase.concessionnaireId);
  if (!conc || conc.deletedAt) {
    return NextResponse.json({ message: "CONCESSIONNAIRE_NOT_FOUND" }, { status: 404 });
  }
  if (!canReadConcessionnaire(auth.user, conc)) {
    return NextResponse.json({ message: "AGENCE_FORBIDDEN" }, { status: 403 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ message: "Fichier manquant (champ file)" }, { status: 400 });
  }
  if (file.size > MAX_SUCCESSION_FILE_BYTES) {
    return NextResponse.json(
      { message: `Fichier trop volumineux (max ${MAX_SUCCESSION_FILE_BYTES} octets)` },
      { status: 400 },
    );
  }
  const mimeType = file.type || "application/octet-stream";
  if (!SUCCESSION_ALLOWED_MIME[mimeType]) {
    return NextResponse.json({ message: "Type MIME non autorise" }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const documentId = randomUUID();
  const filename = file.name || "document-succession";
  const storedRelativePath = await saveSuccessionDocument(id, documentId, filename, bytes);
  const idAdded = await addSuccessionDocument({
    caseId: id,
    filename,
    mimeType,
    size: bytes.length,
    storedRelativePath,
    actorId: auth.user._id ?? "",
  });

  return NextResponse.json({ documentId: idAdded }, { status: 201 });
}
