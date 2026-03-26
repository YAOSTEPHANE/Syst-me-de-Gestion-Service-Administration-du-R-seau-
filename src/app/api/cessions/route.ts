import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";

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
  statut: z.enum(["SAISIE_AGENT", "CONTROLE_CHEF_SECTION", "VALIDEE_CHEF_SERVICE", "REJETEE"]).optional(),
  produitCode: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, { roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"] });
  if ("error" in auth) return auth.error;
  const parsed = listSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json({ message: "Parametres invalides", issues: parsed.error.issues }, { status: 400 });
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
  const kind = String(form.get("kind") ?? "CESSION").trim() as CessionKind;
  const concessionnaireId = String(form.get("concessionnaireId") ?? "").trim();
  const cedantId = String(form.get("cedantId") ?? "").trim();
  const beneficiaireId = String(form.get("beneficiaireId") ?? "").trim();
  const produitCode = String(form.get("produitCode") ?? "").trim();
  const oldAdresse = String(form.get("oldAdresse") ?? "").trim();
  const oldAgenceId = String(form.get("oldAgenceId") ?? "").trim();
  const newAdresse = String(form.get("newAdresse") ?? "").trim();
  const newAgenceId = String(form.get("newAgenceId") ?? "").trim();
  const newGpsLatRaw = String(form.get("newGpsLat") ?? "").trim();
  const newGpsLngRaw = String(form.get("newGpsLng") ?? "").trim();
  const dateDemandeRaw = String(form.get("dateDemande") ?? "").trim();
  const motif = String(form.get("motif") ?? "").trim();
  const commentaire = String(form.get("commentaire") ?? "").trim();
  if (!dateDemandeRaw || !motif) {
    return NextResponse.json({ message: "Champs obligatoires manquants." }, { status: 400 });
  }
  if (kind === "CESSION" && (!cedantId || !beneficiaireId || !produitCode)) {
    return NextResponse.json({ message: "Champs cession obligatoires manquants." }, { status: 400 });
  }
  if (
    kind === "DELOCALISATION" &&
    (!concessionnaireId || !oldAdresse || !oldAgenceId || !newAdresse || !newAgenceId || !newGpsLatRaw || !newGpsLngRaw)
  ) {
    return NextResponse.json({ message: "Champs délocalisation obligatoires manquants." }, { status: 400 });
  }
  const dateDemande = new Date(dateDemandeRaw);
  if (Number.isNaN(dateDemande.getTime())) {
    return NextResponse.json({ message: "Date de demande invalide." }, { status: 400 });
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
    return NextResponse.json({ message: "Coordonnées GPS invalides." }, { status: 400 });
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
        return NextResponse.json({ message: `Type de fichier non autorisé: ${doc.type}` }, { status: 400 });
      }
      if (doc.size > MAX_CESSION_FILE_BYTES) {
        return NextResponse.json({ message: "Document trop volumineux." }, { status: 400 });
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

