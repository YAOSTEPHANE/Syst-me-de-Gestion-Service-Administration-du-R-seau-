import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

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
    return NextResponse.json({ message: "Parametres invalides", issues: parsed.error.issues }, { status: 400 });
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
    return NextResponse.json({ message: "Champs obligatoires manquants." }, { status: 400 });
  }
  const dateReception = new Date(dateReceptionRaw);
  if (Number.isNaN(dateReception.getTime())) {
    return NextResponse.json({ message: "Date de reception invalide." }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ message: "Document PDF obligatoire." }, { status: 400 });
  }
  if (file.type !== AGREMENT_ALLOWED_MIME) {
    return NextResponse.json({ message: "Seul le PDF est autorise." }, { status: 400 });
  }
  if (file.size > MAX_AGREMENT_FILE_BYTES) {
    return NextResponse.json({ message: "Document trop volumineux." }, { status: 400 });
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

