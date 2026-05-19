import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { badRequest } from "@/lib/api/error-responses";
import { requireApiAuth } from "@/lib/auth/guards";
import { sanitizeConcessionnairePublic } from "@/lib/lonaci/concessionnaires";
import { ribWorkflowErrorResponse } from "@/lib/lonaci/rib-api-errors";
import { attachRibPiece, sanitizeRibWorkflowPublic } from "@/lib/lonaci/rib-bancarisation";
import type { PieceJointeKind } from "@/lib/lonaci/types";
import {
  ALLOWED_PIECE_MIME,
  MAX_PIECE_BYTES,
  saveConcessionnairePiece,
} from "@/lib/storage/concessionnaire-files";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth(request, {
    roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
  });
  if ("error" in auth) return auth.error;

  const { id } = await context.params;
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return badRequest("Fichier RIB requis (champ file).", "MISSING_FILE");
  }
  if (file.size > MAX_PIECE_BYTES) {
    return badRequest(`Fichier trop volumineux (max ${MAX_PIECE_BYTES} octets)`, "FILE_TOO_LARGE");
  }
  const mimeType = file.type || "application/octet-stream";
  if (!ALLOWED_PIECE_MIME[mimeType]) {
    return badRequest("Type MIME non autorisé", "INVALID_MIME_TYPE");
  }

  const pieceId = randomUUID();
  const originalName = file.name || "rib.pdf";
  const buffer = Buffer.from(await file.arrayBuffer());
  const storedRelativePath = await saveConcessionnairePiece(id, pieceId, originalName, buffer);

  try {
    const updated = await attachRibPiece({
      concessionnaireId: id,
      piece: {
        id: pieceId,
        kind: "DOCUMENT" as PieceJointeKind,
        filename: originalName,
        storedRelativePath,
        mimeType,
        size: buffer.length,
        uploadedAt: new Date(),
        uploadedByUserId: auth.user._id ?? "",
      },
      actor: auth.user,
    });
    return NextResponse.json({
      concessionnaire: sanitizeConcessionnairePublic(updated),
      rib: sanitizeRibWorkflowPublic(updated),
      pieceUrl: `/api/concessionnaires/${id}/pieces/${pieceId}`,
    });
  } catch (err) {
    return ribWorkflowErrorResponse(err);
  }
}
