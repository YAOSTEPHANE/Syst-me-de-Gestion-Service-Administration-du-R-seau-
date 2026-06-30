import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { badRequest } from "@/lib/api/error-responses";
import { zodBadRequest } from "@/lib/api/endpoint-helpers";
import { requireListAgenceScope, listAgenceScopeFields } from "@/lib/api/list-agence-scope";
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
    kind: z.enum(["CESSION", "DELOCALISATION", "CESSION_DELOCALISATION"]).optional(),
  statut: z
    .enum(["SAISIE_AGENT", "CONTROLE_CHEF_SECTION", "VALIDATION_N2", "VALIDEE_CHEF_SERVICE", "REJETEE"])
    .optional(),
  produitCode: z.string().optional(),
  agenceId: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

function parseFilterDate(value: string | undefined, endOfDay: boolean): Date | undefined {
  if (!value?.trim()) return undefined;
  const d = new Date(value.trim());
  if (Number.isNaN(d.getTime())) return undefined;
  if (endOfDay) d.setHours(23, 59, 59, 999);
  else d.setHours(0, 0, 0, 0);
  return d;
}

const createFormSchema = z
  .object({
    kind: z.enum(["CESSION", "DELOCALISATION", "CESSION_DELOCALISATION"]),
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
      (!v.concessionnaireId ||
        !v.produitCode ||
        !v.newAdresse ||
        !v.newAgenceId ||
        !v.newGpsLat ||
        !v.newGpsLng)
    ) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Champs delocalisation obligatoires manquants." });
    }
    if (v.kind === "CESSION_DELOCALISATION") {
      if (!v.cedantId || !v.beneficiaireId || !v.produitCode) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Champs cession obligatoires manquants." });
      }
      if (!v.newAdresse || !v.newAgenceId || !v.newGpsLat || !v.newGpsLng) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Nouvelle zone / adresse GPS obligatoires pour la cession-délocalisation.",
        });
      }
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
  const agenceScope = requireListAgenceScope(auth.user, parsed.data.agenceId);
  if (!agenceScope.ok) return agenceScope.response;
  const result = await listCessions({
    page: parsed.data.page,
    pageSize: parsed.data.pageSize,
    kind: parsed.data.kind as CessionKind | undefined,
    statut: parsed.data.statut as CessionStatus | undefined,
    produitCode: parsed.data.produitCode?.trim() || undefined,
    ...listAgenceScopeFields(agenceScope),
    dateFrom: parseFilterDate(parsed.data.dateFrom, false),
    dateTo: parseFilterDate(parsed.data.dateTo, true),
  });
  return NextResponse.json(result, { status: 200 });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(request, { roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"] });
  if ("error" in auth) return auth.error;

  const form = await request.formData();
  const kind = String(form.get("kind") ?? "CESSION").trim();

  const { resolveFormPartyIds } = await import("@/lib/lonaci/client-party-resolve");
  async function pdv(clientKey: string, legacyKey: string, required: boolean): Promise<string> {
    const party = await resolveFormPartyIds({
      lonaciClientId: String(form.get(clientKey) ?? "").trim() || null,
      concessionnaireId: String(form.get(legacyKey) ?? "").trim() || null,
      requirePdv: required,
    });
    if (required && !party.concessionnaireId) {
      throw new Error(party.lonaciClientId ? "CLIENT_NOT_PROMOTED" : "CLIENT_REQUIRED");
    }
    return party.concessionnaireId ?? "";
  }

  let concessionnaireId = "";
  let cedantId = "";
  let beneficiaireId = "";
  try {
    if (kind === "DELOCALISATION" || kind === "CESSION_DELOCALISATION") {
      concessionnaireId = await pdv("lonaciClientId", "concessionnaireId", kind === "DELOCALISATION");
    }
    if (kind === "CESSION" || kind === "CESSION_DELOCALISATION") {
      cedantId = await pdv("cedantLonaciClientId", "cedantId", true);
      beneficiaireId = await pdv("beneficiaireLonaciClientId", "beneficiaireId", true);
    }
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "CLIENT_NOT_FOUND") {
      return badRequest("Client introuvable.", "CLIENT_NOT_FOUND");
    }
    if (code === "CLIENT_NOT_PROMOTED" || code === "CLIENT_REQUIRED") {
      return badRequest("Sélectionnez un client lié à un point de vente.", "CLIENT_NOT_PROMOTED");
    }
    return badRequest("Client invalide.", "CLIENT_INVALID");
  }

  const parsedCreate = createFormSchema.safeParse({
    kind,
    concessionnaireId,
    cedantId,
    beneficiaireId,
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
  const parsedData = parsedCreate.data;
  const {
    kind: cessionKind,
    concessionnaireId: resolvedConcessionnaireId,
    cedantId: resolvedCedantId,
    beneficiaireId: resolvedBeneficiaireId,
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
  } = parsedData;
  const dateDemande = new Date(dateDemandeRaw);
  if (Number.isNaN(dateDemande.getTime())) {
    return badRequest("Date de demande invalide.", "INVALID_DATE_DEMANDE");
  }
  const newGpsLat = Number(newGpsLatRaw);
  const newGpsLng = Number(newGpsLngRaw);
  const needsGps = cessionKind === "DELOCALISATION" || cessionKind === "CESSION_DELOCALISATION";
  const newGps =
    needsGps && Number.isFinite(newGpsLat) && Number.isFinite(newGpsLng)
      ? { lat: newGpsLat, lng: newGpsLng }
      : null;
  if (needsGps && !newGps) {
    return badRequest("Coordonnees GPS invalides.", "INVALID_GPS");
  }

  await ensureCessionIndexes();
  try {
    const created = await createCession({
      kind: cessionKind,
      concessionnaireId: resolvedConcessionnaireId || null,
      cedantId: resolvedCedantId || null,
      beneficiaireId: resolvedBeneficiaireId || null,
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

