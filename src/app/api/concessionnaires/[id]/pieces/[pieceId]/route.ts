import { Readable } from "node:stream";

import { NextRequest, NextResponse } from "next/server";

import { canMutateConcessionnaireCore, canReadConcessionnaire, isStatutFicheGelee } from "@/lib/lonaci/access";
import {
  ensureConcessionnaireIndexes,
  findConcessionnaireById,
  removePieceJointe,
  sanitizeConcessionnairePublic,
} from "@/lib/lonaci/concessionnaires";
import { requireApiAuth } from "@/lib/auth/guards";
import { createPieceReadStream, deletePieceFile } from "@/lib/storage/concessionnaire-files";

interface RouteContext {
  params: Promise<{ id: string; pieceId: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth(request, {
    roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
  });
  if ("error" in auth) {
    return auth.error;
  }

  const { id, pieceId } = await context.params;
  await ensureConcessionnaireIndexes();
  const doc = await findConcessionnaireById(id);
  if (!doc || doc.deletedAt) {
    return NextResponse.json({ message: "Non trouve" }, { status: 404 });
  }

  if (!canReadConcessionnaire(auth.user, doc)) {
    return NextResponse.json({ message: "Acces refuse" }, { status: 403 });
  }

  const piece = doc.piecesJointes.find((p) => p.id === pieceId);
  if (!piece) {
    return NextResponse.json({ message: "Piece introuvable" }, { status: 404 });
  }

  const nodeStream = createPieceReadStream(piece.storedRelativePath);
  const webStream = Readable.toWeb(nodeStream);

  const filename = encodeURIComponent(piece.filename);

  return new NextResponse(webStream as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": piece.mimeType,
      "Content-Disposition": `inline; filename="${filename}"`,
    },
  });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth(request, {
    roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
  });
  if ("error" in auth) {
    return auth.error;
  }

  const { id, pieceId } = await context.params;
  await ensureConcessionnaireIndexes();
  const doc = await findConcessionnaireById(id);
  if (!doc || doc.deletedAt) {
    return NextResponse.json({ message: "Non trouve" }, { status: 404 });
  }

  if (isStatutFicheGelee(doc.statut)) {
    return NextResponse.json(
      { message: "Suppression de pieces interdite pour ce statut" },
      { status: 403 },
    );
  }

  if (!canMutateConcessionnaireCore(auth.user, doc)) {
    return NextResponse.json({ message: "Modification interdite" }, { status: 403 });
  }

  const { doc: updated, removed } = await removePieceJointe(id, pieceId, auth.user);
  if (!removed) {
    return NextResponse.json({ message: "Piece introuvable" }, { status: 404 });
  }

  await deletePieceFile(removed.storedRelativePath);

  return NextResponse.json(
    {
      ok: true,
      concessionnaire: updated ? sanitizeConcessionnairePublic(updated) : null,
    },
    { status: 200 },
  );
}
