import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { badRequest } from "@/lib/api/error-responses";
import { zodBadRequest } from "@/lib/api/endpoint-helpers";
import {
  attachAgrementDocument,
  createAgrement,
  ensureAgrementsIndexes,
  listAgrements,
} from "@/lib/lonaci/agrements";
import { requireApiAuth } from "@/lib/auth/guards";
import { AGREMENT_ALLOWED_MIME, MAX_AGREMENT_FILE_BYTES, saveAgrementPdf } from "@/lib/storage/agrements-files";

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  agenceId: z.string().optional(),
  produitCode: z.string().optional(),
  statut: z.enum(["RECU", "CONTROLE", "TRANSMIS", "FINALISE"]).optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
});

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, { roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"] });
  if ("error" in auth) return auth.error;
  const parsed = listSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
  if (!parsed.success) {
    return zodBadRequest(parsed.error, "Parametres invalides");
  }
  await ensureAgrementsIndexes();
  const result = await listAgrements({
    page: parsed.data.page,
    pageSize: parsed.data.pageSize,
    agenceId: parsed.data.agenceId?.trim() || undefined,
    produitCode: parsed.data.produitCode?.trim() || undefined,
    statut: parsed.data.statut,
    dateFrom: parsed.data.dateFrom ? new Date(parsed.data.dateFrom) : undefined,
    dateTo: parsed.data.dateTo ? new Date(parsed.data.dateTo) : undefined,
  });
  return NextResponse.json(result, { status: 200 });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(request, { roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"] });
  if ("error" in auth) return auth.error;
  const form = await request.formData();
  const produitCode = String(form.get("produitCode") ?? "").trim();
  const dateReceptionRaw = String(form.get("dateReception") ?? "").trim();
  const referenceOfficielle = String(form.get("referenceOfficielle") ?? "").trim();
  const agenceIdRaw = String(form.get("agenceId") ?? "").trim();
  const concessionnaireIdRaw = String(form.get("concessionnaireId") ?? "").trim();
  const observationsRaw = String(form.get("observations") ?? "").trim();
  const file = form.get("document");

  if (!produitCode || !dateReceptionRaw || !referenceOfficielle) {
    return badRequest("Champs obligatoires manquants.", "MISSING_REQUIRED_FIELDS");
  }
  const dateReception = new Date(dateReceptionRaw);
  if (Number.isNaN(dateReception.getTime())) {
    return badRequest("Date de reception invalide.", "INVALID_DATE_RECEPTION");
  }
  if (!(file instanceof File)) {
    return badRequest("Document PDF obligatoire.", "MISSING_DOCUMENT");
  }
  if (file.type !== AGREMENT_ALLOWED_MIME) {
    return badRequest("Seul le PDF est autorise.", "INVALID_MIME_TYPE");
  }
  if (file.size > MAX_AGREMENT_FILE_BYTES) {
    return badRequest("Document trop volumineux.", "FILE_TOO_LARGE");
  }

  await ensureAgrementsIndexes();
  const created = await createAgrement({
    produitCode,
    dateReception,
    referenceOfficielle,
    agenceId: agenceIdRaw || null,
    concessionnaireId: concessionnaireIdRaw || null,
    observations: observationsRaw || null,
    documentFilename: file.name || "agrement.pdf",
    documentMimeType: file.type,
    documentSize: file.size,
    actorId: auth.user._id ?? "",
  });
  const buffer = Buffer.from(await file.arrayBuffer());
  const storedRelativePath = await saveAgrementPdf(created.id, file.name || "agrement.pdf", buffer);
  await attachAgrementDocument({
    id: created.id,
    storedRelativePath,
    actorId: auth.user._id ?? "",
  });
  return NextResponse.json({ item: { id: created.id, reference: created.reference, statut: "RECU" } }, { status: 201 });
}

