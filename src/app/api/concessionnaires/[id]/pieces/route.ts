import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";

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
    return NextResponse.json({ message: "Non trouve" }, { status: 404 });
  }

  if (isStatutFicheGelee(doc.statut)) {
    return NextResponse.json(
      { message: "Pieces jointes interdites pour statut resilie ou decede" },
      { status: 403 },
    );
  }

  if (!canMutateConcessionnaireCore(auth.user, doc)) {
    return NextResponse.json({ message: "Modification interdite" }, { status: 403 });
  }

  const form = await request.formData();
  const file = form.get("file");
  const kindRaw = form.get("kind");

  if (!(file instanceof File)) {
    return NextResponse.json({ message: "Fichier manquant (champ file)" }, { status: 400 });
  }

  const kind = typeof kindRaw === "string" && (kindRaw === "PHOTO" || kindRaw === "DOCUMENT") ? kindRaw : null;
  if (!kind) {
    return NextResponse.json({ message: "kind requis: PHOTO ou DOCUMENT" }, { status: 400 });
  }

  if (file.size > MAX_PIECE_BYTES) {
    return NextResponse.json({ message: `Fichier trop volumineux (max ${MAX_PIECE_BYTES} octets)` }, { status: 400 });
  }

  const mimeType = file.type || "application/octet-stream";
  if (!ALLOWED_PIECE_MIME[mimeType]) {
    return NextResponse.json({ message: "Type MIME non autorise" }, { status: 400 });
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
    return NextResponse.json({ message: "Enregistrement impossible" }, { status: 500 });
  }

  let out = updated;
  if (kind === "PHOTO") {
    const photoUrl = `/api/concessionnaires/${id}/pieces/${pieceId}`;
    const withPhoto = await updateConcessionnaire(id, { photoUrl }, auth.user);
    if (withPhoto) out = withPhoto;
  }

  return NextResponse.json({ concessionnaire: sanitizeConcessionnairePublic(out) }, { status: 201 });
}
