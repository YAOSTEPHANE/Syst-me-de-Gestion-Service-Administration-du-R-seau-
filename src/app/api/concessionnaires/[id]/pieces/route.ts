import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { badRequest, forbidden, notFound, serverError } from "@/lib/api/error-responses";
import { zodBadRequest } from "@/lib/api/endpoint-helpers";
import { canMutateConcessionnaireCore, isStatutFicheGelee } from "@/lib/lonaci/access";
import {
  addPieceJointe,
  ensureConcessionnaireIndexes,
  findConcessionnaireById,
  sanitizeConcessionnairePublic,
  updateConcessionnaire,
} from "@/lib/lonaci/concessionnaires";
import type { PieceJointeKind } from "@/lib/lonaci/types";
import { requireApiAuth } from "@/lib/auth/guards";
import {
  ALLOWED_PIECE_MIME,
  MAX_PIECE_BYTES,
  saveConcessionnairePiece,
} from "@/lib/storage/concessionnaire-files";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const pieceFormSchema = z.object({
  file: z.instanceof(File),
  kind: z.enum(["PHOTO", "DOCUMENT"]),
});

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth(request, {
    roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
  });
  if ("error" in auth) {
    return auth.error;
  }

  const { id } = await context.params;
  await ensureConcessionnaireIndexes();
  const doc = await findConcessionnaireById(id);
  if (!doc || doc.deletedAt) {
    return notFound("Non trouve", "CONCESSIONNAIRE_NOT_FOUND");
  }

  if (isStatutFicheGelee(doc.statut)) {
    return forbidden("Pieces jointes interdites pour statut resilie ou decede", "CONCESSIONNAIRE_FROZEN");
  }

  if (!canMutateConcessionnaireCore(auth.user, doc)) {
    return forbidden("Modification interdite", "CONCESSIONNAIRE_MUTATION_FORBIDDEN");
  }

  const form = await request.formData();
  const parsedForm = pieceFormSchema.safeParse({
    file: form.get("file"),
    kind: form.get("kind"),
  });
  if (!parsedForm.success) {
    return zodBadRequest(parsedForm.error);
  }
  const { file, kind } = parsedForm.data;

  if (file.size > MAX_PIECE_BYTES) {
    return badRequest(`Fichier trop volumineux (max ${MAX_PIECE_BYTES} octets)`, "FILE_TOO_LARGE");
  }

  const mimeType = file.type || "application/octet-stream";
  if (!ALLOWED_PIECE_MIME[mimeType]) {
    return badRequest("Type MIME non autorise", "INVALID_MIME_TYPE");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const pieceId = randomUUID();
  const originalName = file.name || "fichier";
  const storedRelativePath = await saveConcessionnairePiece(id, pieceId, originalName, buffer);

  const piece = {
    id: pieceId,
    kind: kind as PieceJointeKind,
    filename: originalName,
    storedRelativePath,
    mimeType,
    size: buffer.length,
    uploadedAt: new Date(),
    uploadedByUserId: auth.user._id ?? "",
  };

  const updated = await addPieceJointe(id, piece, auth.user);
  if (!updated) {
    return serverError("Enregistrement impossible", "PIECE_SAVE_FAILED");
  }

  let out = updated;
  if (kind === "PHOTO") {
    const photoUrl = `/api/concessionnaires/${id}/pieces/${pieceId}`;
    const withPhoto = await updateConcessionnaire(id, { photoUrl }, auth.user);
    if (withPhoto) out = withPhoto;
  }

  return NextResponse.json({ concessionnaire: sanitizeConcessionnairePublic(out) }, { status: 201 });
}
