import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { badRequest } from "@/lib/api/error-responses";
import { zodBadRequest } from "@/lib/api/endpoint-helpers";
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

const ribFileSchema = z.object({
  size: z.number().int().positive().max(MAX_PIECE_BYTES),
  mimeType: z
    .string()
    .min(1)
    .refine((m) => Boolean(ALLOWED_PIECE_MIME[m]), { message: "Type MIME non autorisé" }),
});

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
  const mimeType = file.type || "application/octet-stream";
  const fileParsed = ribFileSchema.safeParse({ size: file.size, mimeType });
  if (!fileParsed.success) {
    return zodBadRequest(fileParsed.error, "Fichier RIB invalide");
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
