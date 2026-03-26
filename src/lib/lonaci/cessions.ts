import { randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";

import { appendAuditLog } from "@/lib/lonaci/audit";
import { findConcessionnaireById, updateConcessionnaire } from "@/lib/lonaci/concessionnaires";
import { hasActiveContractForProduct, markActiveContratAsCedeForProduct } from "@/lib/lonaci/contracts";
import { notifyRoleTargets } from "@/lib/lonaci/notifications";
import type { UserDocument } from "@/lib/lonaci/types";
import { sendSmtpEmail } from "@/lib/email/smtp";
import { getDatabase } from "@/lib/mongodb";

const COLLECTION = "cessions";
const COUNTERS_COLLECTION = "counters";
const REF_COUNTER_ID = "cession_ref";

export type CessionStatus = "SAISIE_AGENT" | "CONTROLE_CHEF_SECTION" | "VALIDEE_CHEF_SERVICE" | "REJETEE";
export type CessionKind = "CESSION" | "DELOCALISATION";

interface CessionAttachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  storedRelativePath: string;
  uploadedAt: Date;
  uploadedByUserId: string;
}

interface CessionStored {
  _id: ObjectId;
  reference: string;
  kind: CessionKind;
  concessionnaireId: string | null;
  cedantId: string | null;
  beneficiaireId: string | null;
  produitCode: string | null;
  oldAdresse: string | null;
  oldAgenceId: string | null;
  newAdresse: string | null;
  newAgenceId: string | null;
  newGps: { lat: number; lng: number } | null;
  dateDemande: Date;
  motif: string;
  statut: CessionStatus;
  commentaire: string | null;
  attachments: CessionAttachment[];
  controlledAt: Date | null;
  controlledByUserId: string | null;
  validatedAt: Date | null;
  validatedByUserId: string | null;
  createdByUserId: string;
  updatedByUserId: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface CessionListItem {
  id: string;
  reference: string;
  kind: CessionKind;
  concessionnaireId: string | null;
  cedantId: string | null;
  beneficiaireId: string | null;
  produitCode: string | null;
  oldAdresse: string | null;
  oldAgenceId: string | null;
  newAdresse: string | null;
  newAgenceId: string | null;
  newGps: { lat: number; lng: number } | null;
  dateDemande: string;
  motif: string;
  statut: CessionStatus;
  commentaire: string | null;
  attachmentsCount: number;
  attachments: Array<{ id: string; filename: string; mimeType: string; size: number; uploadedAt: string }>;
  createdAt: string;
  updatedAt: string;
}

function mapCession(row: CessionStored): CessionListItem {
  return {
    id: row._id.toHexString(),
    reference: row.reference,
    kind: row.kind,
    concessionnaireId: row.concessionnaireId,
    cedantId: row.cedantId,
    beneficiaireId: row.beneficiaireId,
    produitCode: row.produitCode,
    oldAdresse: row.oldAdresse,
    oldAgenceId: row.oldAgenceId,
    newAdresse: row.newAdresse,
    newAgenceId: row.newAgenceId,
    newGps: row.newGps,
    dateDemande: row.dateDemande.toISOString(),
    motif: row.motif,
    statut: row.statut,
    commentaire: row.commentaire,
    attachmentsCount: row.attachments.length,
    attachments: row.attachments.map((a) => ({
      id: a.id,
      filename: a.filename,
      mimeType: a.mimeType,
      size: a.size,
      uploadedAt: a.uploadedAt.toISOString(),
    })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function ensureCessionIndexes() {
  const db = await getDatabase();
  await db.collection<CessionStored>(COLLECTION).createIndexes([
    { key: { reference: 1 }, unique: true, name: "uniq_reference" },
    { key: { kind: 1, statut: 1, updatedAt: -1 }, name: "idx_kind_status_updated" },
    { key: { statut: 1, updatedAt: -1 }, name: "idx_status_updated" },
    { key: { cedantId: 1 }, name: "idx_cedant" },
    { key: { beneficiaireId: 1 }, name: "idx_beneficiaire" },
    { key: { concessionnaireId: 1 }, name: "idx_concessionnaire" },
    { key: { deletedAt: 1 }, name: "idx_deleted" },
  ]);
}

async function nextReference() {
  const db = await getDatabase();
  await db
    .collection<{ _id: string; seq: number }>(COUNTERS_COLLECTION)
    .updateOne({ _id: REF_COUNTER_ID }, { $inc: { seq: 1 } }, { upsert: true });
  const c = await db.collection<{ _id: string; seq: number }>(COUNTERS_COLLECTION).findOne({ _id: REF_COUNTER_ID });
  return `CES-${String(c?.seq ?? 1).padStart(6, "0")}`;
}

export interface CreateCessionInput {
  kind: CessionKind;
  concessionnaireId?: string | null;
  cedantId?: string | null;
  beneficiaireId?: string | null;
  produitCode?: string | null;
  oldAdresse?: string | null;
  oldAgenceId?: string | null;
  newAdresse?: string | null;
  newAgenceId?: string | null;
  newGps?: { lat: number; lng: number } | null;
  dateDemande: Date;
  motif: string;
  commentaire?: string | null;
  actor: UserDocument;
}

export async function createCession(input: CreateCessionInput): Promise<CessionListItem> {
  if (!input.actor._id) throw new Error("ACTOR_REQUIRED");
  let cedant = null;
  let beneficiaire = null;
  let concessionnaire = null;
  if (input.kind === "CESSION") {
    if (!input.cedantId || !input.beneficiaireId || !input.produitCode) {
      throw new Error("CESSION_FIELDS_REQUIRED");
    }
    if (input.cedantId === input.beneficiaireId) throw new Error("BENEFICIAIRE_DOIT_DIFFERER");
    const hasActive = await hasActiveContractForProduct(input.cedantId, input.produitCode.trim().toUpperCase());
    if (!hasActive) throw new Error("CONTRAT_SOURCE_INACTIF");
    [cedant, beneficiaire] = await Promise.all([
      findConcessionnaireById(input.cedantId),
      findConcessionnaireById(input.beneficiaireId),
    ]);
    if (!cedant || cedant.deletedAt) throw new Error("CEDANT_NOT_FOUND");
    if (!beneficiaire || beneficiaire.deletedAt) throw new Error("BENEFICIAIRE_NOT_FOUND");
  } else {
    if (!input.concessionnaireId || !input.oldAdresse || !input.oldAgenceId || !input.newAdresse || !input.newAgenceId || !input.newGps) {
      throw new Error("DELOCALISATION_FIELDS_REQUIRED");
    }
    concessionnaire = await findConcessionnaireById(input.concessionnaireId);
    if (!concessionnaire || concessionnaire.deletedAt) throw new Error("CONCESSIONNAIRE_NOT_FOUND");
  }

  const db = await getDatabase();
  const now = new Date();
  const reference = await nextReference();
  const doc: Omit<CessionStored, "_id"> = {
    reference,
    kind: input.kind,
    concessionnaireId: input.kind === "DELOCALISATION" ? input.concessionnaireId ?? null : null,
    cedantId: input.kind === "CESSION" ? input.cedantId ?? null : null,
    beneficiaireId: input.kind === "CESSION" ? input.beneficiaireId ?? null : null,
    produitCode: input.kind === "CESSION" ? input.produitCode?.trim().toUpperCase() ?? null : null,
    oldAdresse:
      input.kind === "DELOCALISATION" ? (input.oldAdresse?.trim() || concessionnaire?.adresse || null) : null,
    oldAgenceId: input.kind === "DELOCALISATION" ? (input.oldAgenceId || concessionnaire?.agenceId || null) : null,
    newAdresse: input.kind === "DELOCALISATION" ? input.newAdresse?.trim() || null : null,
    newAgenceId: input.kind === "DELOCALISATION" ? input.newAgenceId || null : null,
    newGps: input.kind === "DELOCALISATION" ? input.newGps ?? null : null,
    dateDemande: input.dateDemande,
    motif: input.motif.trim(),
    statut: "SAISIE_AGENT",
    commentaire: input.commentaire?.trim() || null,
    attachments: [],
    controlledAt: null,
    controlledByUserId: null,
    validatedAt: null,
    validatedByUserId: null,
    createdByUserId: input.actor._id,
    updatedByUserId: input.actor._id,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  const r = await db.collection<CessionStored>(COLLECTION).insertOne(doc as CessionStored);

  await appendAuditLog({
    entityType: "DOSSIER",
    entityId: r.insertedId.toHexString(),
    action: "CESSION_CREATE",
    userId: input.actor._id,
    details: {
      reference,
      kind: input.kind,
      cedantId: doc.cedantId,
      beneficiaireId: doc.beneficiaireId,
      concessionnaireId: doc.concessionnaireId,
      produitCode: doc.produitCode,
    },
  });

  await notifyRoleTargets(
    "CHEF_SECTION",
    input.kind === "CESSION" ? "Nouvelle demande de cession" : "Nouvelle demande de délocalisation",
    `${reference} en attente de contrôle (AGENT → CHEF_SECTION).`,
    { cessionId: r.insertedId.toHexString(), reference },
  );

  const created = await db.collection<CessionStored>(COLLECTION).findOne({ _id: r.insertedId });
  if (!created) throw new Error("CESSION_NOT_FOUND");
  return mapCession(created);
}

export async function addCessionAttachment(input: {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  storedRelativePath: string;
  actorId: string;
}) {
  if (!ObjectId.isValid(input.id)) throw new Error("CESSION_NOT_FOUND");
  const db = await getDatabase();
  const now = new Date();
  const attachment: CessionAttachment = {
    id: randomUUID(),
    filename: input.filename,
    mimeType: input.mimeType,
    size: input.size,
    storedRelativePath: input.storedRelativePath,
    uploadedAt: now,
    uploadedByUserId: input.actorId,
  };
  const res = await db.collection<CessionStored>(COLLECTION).updateOne(
    { _id: new ObjectId(input.id), deletedAt: null },
    {
      $push: { attachments: attachment },
      $set: { updatedAt: now, updatedByUserId: input.actorId },
    },
  );
  if (res.matchedCount === 0) throw new Error("CESSION_NOT_FOUND");
}

export async function listCessions(input: {
  page: number;
  pageSize: number;
  kind?: CessionKind;
  statut?: CessionStatus;
  produitCode?: string;
}) {
  const db = await getDatabase();
  const filter: Record<string, unknown> = { deletedAt: null };
  if (input.kind) filter.kind = input.kind;
  if (input.statut) filter.statut = input.statut;
  if (input.produitCode) filter.produitCode = input.produitCode.toUpperCase();
  const skip = (input.page - 1) * input.pageSize;
  const [total, rows] = await Promise.all([
    db.collection<CessionStored>(COLLECTION).countDocuments(filter),
    db.collection<CessionStored>(COLLECTION).find(filter).sort({ updatedAt: -1 }).skip(skip).limit(input.pageSize).toArray(),
  ]);
  return {
    items: rows.map(mapCession),
    total,
    page: input.page,
    pageSize: input.pageSize,
  };
}

export async function getCessionAttachment(input: { id: string; attachmentId: string }) {
  if (!ObjectId.isValid(input.id)) return null;
  const db = await getDatabase();
  const row = await db.collection<CessionStored>(COLLECTION).findOne({ _id: new ObjectId(input.id), deletedAt: null });
  if (!row) return null;
  const attachment = row.attachments.find((a) => a.id === input.attachmentId);
  if (!attachment) return null;
  return attachment;
}

function ensureTransitionAllowed(role: string, from: CessionStatus, target: CessionStatus) {
  if (from === "SAISIE_AGENT" && target === "CONTROLE_CHEF_SECTION") {
    if (!["CHEF_SECTION", "CHEF_SERVICE"].includes(role)) throw new Error("FORBIDDEN_TRANSITION");
    return;
  }
  if (from === "CONTROLE_CHEF_SECTION" && target === "VALIDEE_CHEF_SERVICE") {
    if (!["CHEF_SERVICE"].includes(role)) throw new Error("FORBIDDEN_TRANSITION");
    return;
  }
  if (target === "REJETEE") {
    if (!["CHEF_SECTION", "CHEF_SERVICE"].includes(role)) throw new Error("FORBIDDEN_TRANSITION");
    return;
  }
  throw new Error("INVALID_TRANSITION");
}

export async function transitionCession(input: {
  id: string;
  target: CessionStatus;
  commentaire?: string | null;
  actor: UserDocument;
}) {
  if (!input.actor._id) throw new Error("ACTOR_REQUIRED");
  if (!ObjectId.isValid(input.id)) throw new Error("CESSION_NOT_FOUND");

  const db = await getDatabase();
  const row = await db.collection<CessionStored>(COLLECTION).findOne({ _id: new ObjectId(input.id), deletedAt: null });
  if (!row) throw new Error("CESSION_NOT_FOUND");

  ensureTransitionAllowed(input.actor.role, row.statut, input.target);

  const now = new Date();
  const $set: Record<string, unknown> = {
    statut: input.target,
    commentaire: input.commentaire?.trim() || row.commentaire || null,
    updatedAt: now,
    updatedByUserId: input.actor._id,
  };
  if (input.target === "CONTROLE_CHEF_SECTION") {
    $set.controlledAt = now;
    $set.controlledByUserId = input.actor._id;
    await notifyRoleTargets(
      "CHEF_SERVICE",
      "Cession contrôlée, en attente de validation",
      `${row.reference} est prête pour validation CHEF_SERVICE.`,
      { cessionId: input.id, reference: row.reference },
    );
  }
  if (input.target === "VALIDEE_CHEF_SERVICE") {
    $set.validatedAt = now;
    $set.validatedByUserId = input.actor._id;
  }

  await db.collection<CessionStored>(COLLECTION).updateOne({ _id: row._id }, { $set });

  if (input.target === "VALIDEE_CHEF_SERVICE") {
    if (row.kind === "CESSION") {
      const [cedant, beneficiaire] = await Promise.all([
        row.cedantId ? findConcessionnaireById(row.cedantId) : Promise.resolve(null),
        row.beneficiaireId ? findConcessionnaireById(row.beneficiaireId) : Promise.resolve(null),
      ]);
      if (row.cedantId && row.produitCode) {
        await markActiveContratAsCedeForProduct({
          concessionnaireId: row.cedantId,
          produitCode: row.produitCode,
          actor: input.actor,
          cessionId: input.id,
          cessionReference: row.reference,
        });
      }
      if (cedant && cedant._id && row.produitCode) {
        const next = Array.from(new Set((cedant.produitsAutorises ?? []).filter((p) => p !== row.produitCode)));
        await updateConcessionnaire(cedant._id, { produitsAutorises: next }, input.actor);
      }
      if (beneficiaire && beneficiaire._id && row.produitCode) {
        const next = Array.from(new Set([...(beneficiaire.produitsAutorises ?? []), row.produitCode]));
        await updateConcessionnaire(beneficiaire._id, { produitsAutorises: next }, input.actor);
      }
      const emails = [cedant?.email, beneficiaire?.email]
        .filter((v): v is string => Boolean(v && v.trim()))
        .map((v) => v.trim());
      if (emails.length) {
        await sendSmtpEmail(
          emails,
          `Cession validée ${row.reference}`,
          `La cession ${row.reference} a été validée par CHEF_SERVICE. Les fiches concessionnaires ont été mises à jour.`,
        );
      }
    } else if (row.concessionnaireId) {
      const concessionnaire = await findConcessionnaireById(row.concessionnaireId);
      if (concessionnaire?._id && row.newAgenceId && row.newGps) {
        await updateConcessionnaire(
          concessionnaire._id,
          {
            agenceId: row.newAgenceId,
            gps: row.newGps,
            adresse: row.newAdresse ?? concessionnaire.adresse ?? null,
          },
          input.actor,
        );
      }
      const email = concessionnaire?.email?.trim();
      if (email) {
        await sendSmtpEmail(
          [email],
          `Délocalisation validée ${row.reference}`,
          `La délocalisation ${row.reference} a été validée. Votre agence/adresse/GPS ont été mis à jour.`,
        );
      }
    }
  }

  await appendAuditLog({
    entityType: "DOSSIER",
    entityId: input.id,
    action: `CESSION_${input.target}`,
    userId: input.actor._id,
    details: { from: row.statut, to: input.target },
  });
}

