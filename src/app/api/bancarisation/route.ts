import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { badRequest, forbidden, notFound } from "@/lib/api/error-responses";
import { zodBadRequest } from "@/lib/api/endpoint-helpers";
import { canReadConcessionnaire } from "@/lib/lonaci/access";
import { type BancarisationStatut, BANCARISATION_STATUTS } from "@/lib/lonaci/constants";
import {
  bancarisationCountersByAgenceProduit,
  createBancarisationRequest,
  listBancarisationRequests,
  sanitizeBancarisationRequestPublic,
} from "@/lib/lonaci/bancarisation";
import { concessionnaireListScopeAgenceId, findConcessionnaireById } from "@/lib/lonaci/concessionnaires";
import { addPieceJointe } from "@/lib/lonaci/concessionnaires";
import { listAgences } from "@/lib/lonaci/referentials";
import type { PieceJointeKind } from "@/lib/lonaci/types";
import { requireApiAuth } from "@/lib/auth/guards";
import {
  ALLOWED_PIECE_MIME,
  MAX_PIECE_BYTES,
  saveConcessionnairePiece,
} from "@/lib/storage/concessionnaire-files";

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["SOUMIS", "VALIDE", "REJETE"]).optional(),
  statut: z.enum(BANCARISATION_STATUTS).optional(),
  agenceId: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, {
    roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
  });
  if ("error" in auth) return auth.error;

  const parsed = listSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
  if (!parsed.success) {
    return zodBadRequest(parsed.error, "Parametres invalides");
  }

  const scopeAgenceId = concessionnaireListScopeAgenceId(auth.user);
  const [requests, counters, agences] = await Promise.all([
    listBancarisationRequests({
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
      status: parsed.data.status,
      statut: parsed.data.statut,
      agenceId: parsed.data.agenceId,
      scopeAgenceId,
    }),
    bancarisationCountersByAgenceProduit(scopeAgenceId),
    listAgences(),
  ]);
  const agenceLabelById = Object.fromEntries(agences.map((a) => [a._id ?? "", `${a.code} - ${a.libelle}`]));

  return NextResponse.json({
    total: requests.total,
    items: requests.items.map(sanitizeBancarisationRequestPublic),
    counters: counters.map((c) => ({
      ...c,
      agenceLabel: c.agenceId ? (agenceLabelById[c.agenceId] ?? c.agenceId) : "Sans agence",
    })),
  });
}

const statutValues = new Set<BancarisationStatut>(BANCARISATION_STATUTS);

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(request, {
    roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
  });
  if ("error" in auth) return auth.error;

  const form = await request.formData();
  const concessionnaireId = String(form.get("concessionnaireId") ?? "").trim();
  const nouveauStatut = String(form.get("nouveauStatut") ?? "").trim() as BancarisationStatut;
  const compteBancaireRaw = String(form.get("compteBancaire") ?? "").trim();
  const banqueRaw = String(form.get("banqueEtablissement") ?? "").trim();
  const dateEffetRaw = String(form.get("dateEffet") ?? "").trim();
  const produitCodeRaw = String(form.get("produitCode") ?? "").trim();
  const file = form.get("file");

  if (!concessionnaireId) {
    return badRequest("Concessionnaire requis.", "CONCESSIONNAIRE_REQUIRED");
  }
  if (!statutValues.has(nouveauStatut)) {
    return badRequest("Nouveau statut invalide.", "INVALID_NEW_STATUS");
  }
  if (nouveauStatut === "BANCARISE" && !compteBancaireRaw) {
    return badRequest(
      "Le numero de compte est obligatoire pour BANCARISE.",
      "BANK_ACCOUNT_REQUIRED",
    );
  }
  const dateEffet = new Date(dateEffetRaw);
  if (Number.isNaN(dateEffet.getTime())) {
    return badRequest("Date d'effet invalide.", "INVALID_DATE_EFFET");
  }
  if (!(file instanceof File)) {
    return badRequest("Document justificatif requis (champ file).", "MISSING_FILE");
  }
  if (file.size > MAX_PIECE_BYTES) {
    return badRequest(`Fichier trop volumineux (max ${MAX_PIECE_BYTES} octets)`, "FILE_TOO_LARGE");
  }
  const mimeType = file.type || "application/octet-stream";
  if (!ALLOWED_PIECE_MIME[mimeType]) {
    return badRequest("Type MIME non autorise", "INVALID_MIME_TYPE");
  }

  const concessionnaire = await findConcessionnaireById(concessionnaireId);
  if (!concessionnaire || concessionnaire.deletedAt) {
    return notFound("Concessionnaire introuvable.", "CONCESSIONNAIRE_NOT_FOUND");
  }
  if (!canReadConcessionnaire(auth.user, concessionnaire)) {
    return forbidden("Acces refuse.", "ACCESS_DENIED");
  }

  const pieceId = randomUUID();
  const originalName = file.name || "justificatif";
  const buffer = Buffer.from(await file.arrayBuffer());
  const storedRelativePath = await saveConcessionnairePiece(concessionnaireId, pieceId, originalName, buffer);
  await addPieceJointe(
    concessionnaireId,
    {
      id: pieceId,
      kind: "DOCUMENT" as PieceJointeKind,
      filename: originalName,
      storedRelativePath,
      mimeType,
      size: buffer.length,
      uploadedAt: new Date(),
      uploadedByUserId: auth.user._id ?? "",
    },
    auth.user,
  );

  const created = await createBancarisationRequest({
    concessionnaireId,
    agenceId: concessionnaire.agenceId,
    produitCode: produitCodeRaw || null,
    statutActuel: concessionnaire.statutBancarisation,
    nouveauStatut,
    compteBancaire: compteBancaireRaw || null,
    banqueEtablissement: banqueRaw || null,
    dateEffet,
    justificatif: {
      pieceId,
      filename: originalName,
      mimeType,
      size: buffer.length,
      url: `/api/concessionnaires/${concessionnaireId}/pieces/${pieceId}`,
    },
    createdByUserId: auth.user._id ?? "",
  });

  return NextResponse.json({ request: sanitizeBancarisationRequestPublic(created) }, { status: 201 });
}
