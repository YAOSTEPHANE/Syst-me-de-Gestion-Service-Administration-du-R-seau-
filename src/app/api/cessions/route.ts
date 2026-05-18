import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { badRequest } from "@/lib/api/error-responses";
import { zodBadRequest } from "@/lib/api/endpoint-helpers";
import {
  createCession,
  ensureCessionIndexes,
  listCessions,
  type CessionKind,
  type CessionStatus,
  addCessionAttachment,
} from "@/lib/lonaci/cessions";
import { requireApiAuth } from "@/lib/auth/guards";
import {
  CESSION_ALLOWED_MIME,
  MAX_CESSION_FILE_BYTES,
  saveCessionAttachment,
} from "@/lib/storage/cessions-files";

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  kind: z.enum(["CESSION", "DELOCALISATION"]).optional(),
  statut: z
    .enum(["SAISIE_AGENT", "CONTROLE_CHEF_SECTION", "VALIDATION_N2", "VALIDEE_CHEF_SERVICE", "REJETEE"])
    .optional(),
  produitCode: z.string().optional(),
});

const createFormSchema = z
  .object({
    kind: z.enum(["CESSION", "DELOCALISATION"]),
    concessionnaireId: z.string(),
    cedantId: z.string(),
    beneficiaireId: z.string(),
    produitCode: z.string(),
    oldAdresse: z.string(),
    oldAgenceId: z.string(),
    newAdresse: z.string(),
    newAgenceId: z.string(),
    newGpsLat: z.string(),
    newGpsLng: z.string(),
    dateDemande: z.string().min(1),
    motif: z.string().min(1),
    commentaire: z.string(),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "CESSION" && (!v.cedantId || !v.beneficiaireId || !v.produitCode)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Champs cession obligatoires manquants." });
    }
    if (
      v.kind === "DELOCALISATION" &&
      (!v.concessionnaireId || !v.oldAdresse || !v.oldAgenceId || !v.newAdresse || !v.newAgenceId || !v.newGpsLat || !v.newGpsLng)
    ) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Champs delocalisation obligatoires manquants." });
    }
  });

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, { roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"] });
  if ("error" in auth) return auth.error;
  const parsed = listSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
  if (!parsed.success) {
    return zodBadRequest(parsed.error, "Parametres invalides");
  }
  await ensureCessionIndexes();
  const result = await listCessions({
    page: parsed.data.page,
    pageSize: parsed.data.pageSize,
    kind: parsed.data.kind as CessionKind | undefined,
    statut: parsed.data.statut as CessionStatus | undefined,
    produitCode: parsed.data.produitCode?.trim() || undefined,
  });
  return NextResponse.json(result, { status: 200 });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(request, { roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"] });
  if ("error" in auth) return auth.error;

  const form = await request.formData();
  const parsedCreate = createFormSchema.safeParse({
    kind: String(form.get("kind") ?? "CESSION").trim(),
    concessionnaireId: String(form.get("concessionnaireId") ?? "").trim(),
    cedantId: String(form.get("cedantId") ?? "").trim(),
    beneficiaireId: String(form.get("beneficiaireId") ?? "").trim(),
    produitCode: String(form.get("produitCode") ?? "").trim(),
    oldAdresse: String(form.get("oldAdresse") ?? "").trim(),
    oldAgenceId: String(form.get("oldAgenceId") ?? "").trim(),
    newAdresse: String(form.get("newAdresse") ?? "").trim(),
    newAgenceId: String(form.get("newAgenceId") ?? "").trim(),
    newGpsLat: String(form.get("newGpsLat") ?? "").trim(),
    newGpsLng: String(form.get("newGpsLng") ?? "").trim(),
    dateDemande: String(form.get("dateDemande") ?? "").trim(),
    motif: String(form.get("motif") ?? "").trim(),
    commentaire: String(form.get("commentaire") ?? "").trim(),
  });
  if (!parsedCreate.success) {
    return zodBadRequest(parsedCreate.error);
  }
  const {
    kind,
    concessionnaireId,
    cedantId,
    beneficiaireId,
    produitCode,
    oldAdresse,
    oldAgenceId,
    newAdresse,
    newAgenceId,
    newGpsLat: newGpsLatRaw,
    newGpsLng: newGpsLngRaw,
    dateDemande: dateDemandeRaw,
    motif,
    commentaire,
  } = parsedCreate.data;
  const dateDemande = new Date(dateDemandeRaw);
  if (Number.isNaN(dateDemande.getTime())) {
    return badRequest("Date de demande invalide.", "INVALID_DATE_DEMANDE");
  }
  const newGpsLat = Number(newGpsLatRaw);
  const newGpsLng = Number(newGpsLngRaw);
  const newGps =
    kind === "DELOCALISATION"
      ? Number.isFinite(newGpsLat) && Number.isFinite(newGpsLng)
        ? { lat: newGpsLat, lng: newGpsLng }
        : null
      : null;
  if (kind === "DELOCALISATION" && !newGps) {
    return badRequest("Coordonnees GPS invalides.", "INVALID_GPS");
  }

  await ensureCessionIndexes();
  try {
    const created = await createCession({
      kind,
      concessionnaireId: concessionnaireId || null,
      cedantId: cedantId || null,
      beneficiaireId: beneficiaireId || null,
      produitCode: produitCode || null,
      oldAdresse: oldAdresse || null,
      oldAgenceId: oldAgenceId || null,
      newAdresse: newAdresse || null,
      newAgenceId: newAgenceId || null,
      newGps,
      dateDemande,
      motif,
      commentaire: commentaire || null,
      actor: auth.user,
    });

    const docs = form.getAll("documents").filter((d): d is File => d instanceof File);
    for (const doc of docs) {
      if (!CESSION_ALLOWED_MIME[doc.type]) {
        return badRequest(`Type de fichier non autorise: ${doc.type}`, "INVALID_MIME_TYPE");
      }
      if (doc.size > MAX_CESSION_FILE_BYTES) {
        return badRequest("Document trop volumineux.", "FILE_TOO_LARGE");
      }
      const attachmentId = randomUUID();
      const buffer = Buffer.from(await doc.arrayBuffer());
      const storedRelativePath = await saveCessionAttachment(created.id, attachmentId, doc.name || "document", buffer);
      await addCessionAttachment({
        id: created.id,
        filename: doc.name || "document",
        mimeType: doc.type,
        size: doc.size,
        storedRelativePath,
        actorId: auth.user._id ?? "",
      });
    }
    return NextResponse.json({ item: created }, { status: 201 });
  } catch (e) {
    const raw = e instanceof Error ? e.message : "Création impossible";
    const message =
      raw === "CONTRAT_SOURCE_INACTIF"
        ? "Cession impossible : le contrat source doit être au statut ACTIF."
        : raw === "CONTRAT_SOURCE_NOT_FOUND"
          ? "Cession impossible : contrat source introuvable."
          : raw;
    return NextResponse.json({ message }, { status: 400 });
  }
}

