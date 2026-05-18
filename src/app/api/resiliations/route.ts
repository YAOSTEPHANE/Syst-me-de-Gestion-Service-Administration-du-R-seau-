import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { badRequest, conflict, notFound, serverError } from "@/lib/api/error-responses";
import { zodBadRequest } from "@/lib/api/endpoint-helpers";
import {
  addResiliationAttachment,
  createResiliation,
  ensureResiliationIndexes,
  listResiliations,
  type ResiliationStatus,
} from "@/lib/lonaci/resiliations";
import { requireApiAuth } from "@/lib/auth/guards";
import {
  MAX_RESILIATION_FILE_BYTES,
  RESILIATION_ALLOWED_MIME,
  saveResiliationAttachment,
} from "@/lib/storage/resiliations-files";

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  statut: z.enum(["DOSSIER_RECU", "RESILIE"]).optional(),
  concessionnaireId: z.string().optional(),
  produitCode: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
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

  await ensureResiliationIndexes();
  const dateFrom = parsed.data.dateFrom?.trim() ? new Date(parsed.data.dateFrom) : undefined;
  const dateTo = parsed.data.dateTo?.trim() ? new Date(parsed.data.dateTo) : undefined;
  const result = await listResiliations({
    page: parsed.data.page,
    pageSize: parsed.data.pageSize,
    statut: parsed.data.statut as ResiliationStatus | undefined,
    concessionnaireId: parsed.data.concessionnaireId?.trim() || undefined,
    produitCode: parsed.data.produitCode?.trim() || undefined,
    dateFrom: dateFrom && !Number.isNaN(dateFrom.getTime()) ? dateFrom : undefined,
    dateTo: dateTo && !Number.isNaN(dateTo.getTime()) ? dateTo : undefined,
  });
  return NextResponse.json(result, { status: 200 });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(request, {
    roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
  });
  if ("error" in auth) return auth.error;

  const form = await request.formData();
  const concessionnaireId = String(form.get("concessionnaireId") ?? "").trim();
  const produitCode = String(form.get("produitCode") ?? "").trim();
  const dateReceptionRaw = String(form.get("dateReception") ?? "").trim();
  const motif = String(form.get("motif") ?? "").trim();
  const commentaire = String(form.get("commentaire") ?? "").trim();
  if (!concessionnaireId || !produitCode || !dateReceptionRaw || !motif) {
    return badRequest("Champs obligatoires manquants.", "MISSING_REQUIRED_FIELDS");
  }
  const dateReception = new Date(dateReceptionRaw);
  if (Number.isNaN(dateReception.getTime())) {
    return badRequest("Date de réception invalide.", "INVALID_DATE_RECEPTION");
  }

  await ensureResiliationIndexes();
  try {
    const created = await createResiliation({
      concessionnaireId,
      produitCode,
      dateReception,
      motif,
      commentaire: commentaire || null,
      actor: auth.user,
    });

    const docs = form.getAll("documents").filter((d): d is File => d instanceof File);
    for (const doc of docs) {
      if (!RESILIATION_ALLOWED_MIME[doc.type]) {
        return badRequest(`Type de fichier non autorisé: ${doc.type}`, "INVALID_MIME_TYPE");
      }
      if (doc.size > MAX_RESILIATION_FILE_BYTES) {
        return badRequest("Document trop volumineux.", "FILE_TOO_LARGE");
      }
      const attachmentId = randomUUID();
      const buffer = Buffer.from(await doc.arrayBuffer());
      const storedRelativePath = await saveResiliationAttachment(created.id, attachmentId, doc.name || "document", buffer);
      await addResiliationAttachment({
        id: created.id,
        filename: doc.name || "document",
        mimeType: doc.type,
        size: doc.size,
        storedRelativePath,
        actorId: auth.user._id ?? "",
      });
    }
    return NextResponse.json({ item: created }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "CONCESSIONNAIRE_NOT_FOUND") {
      return notFound("Concessionnaire introuvable.", "CONCESSIONNAIRE_NOT_FOUND");
    }
    if (code === "CONCESSIONNAIRE_ALREADY_RESILIE") {
      return conflict("Concessionnaire deja resilie.", "CONCESSIONNAIRE_ALREADY_RESILIE");
    }
    if (code === "ACTIVE_CONTRAT_REQUIRED") {
      return badRequest(
        "Résiliation impossible: contrat ACTIF requis pour ce produit.",
        "ACTIVE_CONTRAT_REQUIRED",
      );
    }
    return serverError("Résiliation impossible.", "RESILIATION_CREATE_FAILED");
  }
}
