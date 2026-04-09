import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { badRequest, forbidden, notFound } from "@/lib/api/error-responses";
import { enforceRateLimit } from "@/lib/api/endpoint-helpers";
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

const paramsSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, "CASE_ID_INVALID"),
});

const formSchema = z.object({
  file: z.instanceof(File),
});

export async function POST(request: NextRequest, context: RouteContext) {
  const rateLimitResponse = await enforceRateLimit(request, {
    namespace: "succession-cases:documents:upload",
    max: 40,
    windowMs: 10 * 60 * 1000,
  });
  if (rateLimitResponse) return rateLimitResponse;

  const auth = await requireApiAuth(request, {
    roles: ["CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
  });
  if ("error" in auth) return auth.error;

  const paramsParsed = paramsSchema.safeParse(await context.params);
  if (!paramsParsed.success) {
    return badRequest("CASE_ID_INVALID", "CASE_ID_INVALID");
  }
  const { id } = paramsParsed.data;
  await ensureSuccessionIndexes();
  const successionCase = await findSuccessionCaseById(id);
  if (!successionCase) {
    return notFound("CASE_NOT_FOUND", "CASE_NOT_FOUND");
  }
  const conc = await findConcessionnaireById(successionCase.concessionnaireId);
  if (!conc || conc.deletedAt) {
    return notFound("CONCESSIONNAIRE_NOT_FOUND", "CONCESSIONNAIRE_NOT_FOUND");
  }
  if (!canReadConcessionnaire(auth.user, conc)) {
    return forbidden("AGENCE_FORBIDDEN", "AGENCE_FORBIDDEN");
  }

  const form = await request.formData().catch(() => null);
  if (!form) {
    return badRequest("Donnees invalides", "INVALID_BODY");
  }
  const formParsed = formSchema.safeParse({ file: form.get("file") });
  if (!formParsed.success) {
    return badRequest("Fichier manquant (champ file)", "MISSING_FILE");
  }
  const file = formParsed.data.file;
  if (file.size > MAX_SUCCESSION_FILE_BYTES) {
    return badRequest(
      `Fichier trop volumineux (max ${MAX_SUCCESSION_FILE_BYTES} octets)`,
      "FILE_TOO_LARGE",
    );
  }
  const mimeType = file.type || "application/octet-stream";
  if (!SUCCESSION_ALLOWED_MIME[mimeType]) {
    return badRequest("Type MIME non autorise", "INVALID_MIME_TYPE");
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
