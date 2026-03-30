import { ObjectId } from "mongodb";
import { randomUUID } from "node:crypto";

import { SUCCESSION_STEPS } from "@/lib/lonaci/constants";
import { appendAuditLog } from "@/lib/lonaci/audit";
import { canReadConcessionnaire } from "@/lib/lonaci/access";
import { findConcessionnaireById, updateConcessionnaire } from "@/lib/lonaci/concessionnaires";
import type { SuccessionCaseDocument, SuccessionStep, UserDocument } from "@/lib/lonaci/types";
import { getDatabase } from "@/lib/mongodb";
import { prisma } from "@/lib/prisma";

const COLLECTION = "succession_cases";
const COUNTERS = "counters";
const REF_ID = "succession_ref";
const DOSSIER_COLLECTION = "dossiers";
const DOSSIER_REF_ID = "dossier_ref";

type StoredSuccession = Omit<SuccessionCaseDocument, "_id"> & { _id: ObjectId };
type InsertSuccession = Omit<StoredSuccession, "_id">;
type InsertDossier = {
  type: "CONTRAT_ACTUALISATION";
  reference: string;
  status: "BROUILLON" | "SOUMIS" | "VALIDE_N1" | "VALIDE_N2" | "FINALISE" | "REJETE";
  concessionnaireId: string;
  agenceId: string | null;
  payload: Record<string, unknown>;
  history: Array<{ status: string; actedByUserId: string; actedAt: Date; comment: string | null }>;
  createdByUserId: string;
  updatedByUserId: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: null;
};

function mapRow(row: StoredSuccession): SuccessionCaseDocument {
  return {
    ...row,
    _id: row._id.toHexString(),
  };
}

async function nextReference(): Promise<string> {
  const db = await getDatabase();
  await db.collection<{ _id: string; seq: number }>(COUNTERS).updateOne(
    { _id: REF_ID },
    { $inc: { seq: 1 } },
    { upsert: true },
  );
  const c = await db.collection<{ _id: string; seq: number }>(COUNTERS).findOne({ _id: REF_ID });
  const seq = c?.seq ?? 1;
  return `SUC-${String(seq).padStart(7, "0")}`;
}

async function nextDossierReference(): Promise<string> {
  const db = await getDatabase();
  await db.collection<{ _id: string; seq: number }>(COUNTERS).updateOne(
    { _id: DOSSIER_REF_ID },
    { $inc: { seq: 1 } },
    { upsert: true },
  );
  const c = await db.collection<{ _id: string; seq: number }>(COUNTERS).findOne({ _id: DOSSIER_REF_ID });
  const seq = c?.seq ?? 1;
  return `DOS-${String(seq).padStart(8, "0")}`;
}

export async function ensureSuccessionIndexes() {
  const db = await getDatabase();
  await db.collection<StoredSuccession>(COLLECTION).createIndexes([
    { key: { reference: 1 }, unique: true, name: "uniq_succession_ref" },
    { key: { concessionnaireId: 1, status: 1 }, name: "idx_conc_status" },
    { key: { agenceId: 1, updatedAt: -1 }, name: "idx_agence_updated" },
    { key: { deletedAt: 1 }, name: "idx_deleted" },
  ]);
}

export interface CreateSuccessionInput {
  concessionnaireId: string;
  dateDeces: Date | null;
  comment: string | null;
  acteDeces: { filename: string; mimeType: string; size: number; storedRelativePath: string } | null;
  actor: UserDocument;
}

export async function createSuccessionCase(input: CreateSuccessionInput): Promise<SuccessionCaseDocument> {
  const conc = await findConcessionnaireById(input.concessionnaireId);
  if (!conc || conc.deletedAt) throw new Error("CONCESSIONNAIRE_NOT_FOUND");
  if (!canReadConcessionnaire(input.actor, conc)) throw new Error("AGENCE_FORBIDDEN");
  if (conc.statut === "DECEDE") throw new Error("ALREADY_DECEDE");
  if (conc.statut === "RESILIE") throw new Error("CONCESSIONNAIRE_RESILIE");
  if (!input.acteDeces) throw new Error("ACTE_DECES_REQUIRED");

  const db = await getDatabase();
  const open = await db.collection<StoredSuccession>(COLLECTION).findOne({
    concessionnaireId: input.concessionnaireId,
    status: "OUVERT",
    deletedAt: null,
  });
  if (open) throw new Error("SUCCESSION_ALREADY_OPEN");

  const now = new Date();
  const reference = await nextReference();
  const firstStep = SUCCESSION_STEPS[0];
  const doc: InsertSuccession = {
    reference,
    concessionnaireId: input.concessionnaireId,
    agenceId: conc.agenceId,
    status: "OUVERT",
    dateDeces: input.dateDeces,
    acteDeces: {
      filename: input.acteDeces.filename,
      mimeType: input.acteDeces.mimeType,
      size: input.acteDeces.size,
      storedRelativePath: input.acteDeces.storedRelativePath,
      uploadedAt: now,
      uploadedByUserId: input.actor._id ?? "",
    },
    ayantDroitNom: null,
    ayantDroitLienParente: null,
    ayantDroitTelephone: null,
    ayantDroitEmail: null,
    documents: [],
    decision: null,
    stepHistory: [
      {
        step: firstStep,
        completedAt: now,
        completedByUserId: input.actor._id ?? "",
        comment: input.comment,
      },
    ],
    createdByUserId: input.actor._id ?? "",
    updatedByUserId: input.actor._id ?? "",
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };

  const result = await db.collection<InsertSuccession>(COLLECTION).insertOne(doc);
  const created = { ...doc, _id: result.insertedId };
  const mapped = mapRow(created);

  // À la déclaration: passage automatique du concessionnaire en DÉCÉDÉ (blocage opérations)
  const note = `DECES DECLARE: ${input.comment ?? ""}`.trim();
  const updatedConc = await updateConcessionnaire(
    input.concessionnaireId,
    {
      statut: "DECEDE",
      notesInternes: conc.notesInternes ? `${conc.notesInternes}\n${note}` : note,
    },
    input.actor,
  );
  if (!updatedConc) throw new Error("CONCESSIONNAIRE_UPDATE_FAILED");

  await appendAuditLog({
    entityType: "SUCCESSION",
    entityId: mapped._id ?? "",
    action: "CREATE",
    userId: input.actor._id ?? "",
    details: { reference, concessionnaireId: input.concessionnaireId, step: firstStep },
  });

  return mapped;
}

function nextStepKey(historyLength: number): SuccessionStep | null {
  if (historyLength >= SUCCESSION_STEPS.length) return null;
  return SUCCESSION_STEPS[historyLength];
}

export interface AdvanceSuccessionInput {
  caseId: string;
  comment: string | null;
  ayantDroitNom?: string | null;
  ayantDroitLienParente?: string | null;
  ayantDroitTelephone?: string | null;
  ayantDroitEmail?: string | null;
  decisionType?: "TRANSFERT" | "RESILIATION" | null;
  actor: UserDocument;
}

async function applyDecisionEffects(input: {
  concessionnaireId: string;
  decisionType: "TRANSFERT" | "RESILIATION";
  actor: UserDocument;
}): Promise<{ autoDossierContratId?: string; autoDossierContratReference?: string }> {
  if (input.decisionType === "RESILIATION") {
    // Résiliation: résilier tous les contrats actifs du concessionnaire
    await prisma.contrat.updateMany({
      where: { concessionnaireId: input.concessionnaireId, status: "ACTIF", deletedAt: null },
      data: { status: "RESILIE", updatedAt: new Date(), updatedByUserId: input.actor._id ?? "" },
    });
    return {};
  }

  const sourceContrat = await prisma.contrat.findFirst({
    where: { concessionnaireId: input.concessionnaireId, status: "ACTIF", deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: { produitCode: true },
  });
  if (!sourceContrat?.produitCode) {
    throw new Error("TRANSFER_SOURCE_CONTRACT_NOT_FOUND");
  }

  const conc = await findConcessionnaireById(input.concessionnaireId);
  if (!conc || conc.deletedAt) {
    throw new Error("CONCESSIONNAIRE_NOT_FOUND");
  }

  const now = new Date();
  const dossierReference = await nextDossierReference();
  const db = await getDatabase();
  const draftDossier: InsertDossier = {
    type: "CONTRAT_ACTUALISATION",
    reference: dossierReference,
    status: "BROUILLON",
    concessionnaireId: input.concessionnaireId,
    agenceId: conc.agenceId,
    payload: {
      produitCode: sourceContrat.produitCode,
      operationType: "NOUVEAU",
      dateEffet: now.toISOString(),
      commentaire: "Initie automatiquement apres decision TRANSFERT en succession.",
      source: "SUCCESSION_TRANSFERT_AUTO",
    },
    history: [],
    createdByUserId: input.actor._id ?? "",
    updatedByUserId: input.actor._id ?? "",
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  const inserted = await db.collection<InsertDossier>(DOSSIER_COLLECTION).insertOne(draftDossier);
  await appendAuditLog({
    entityType: "DOSSIER",
    entityId: inserted.insertedId.toHexString(),
    action: "AUTO_INIT_FROM_SUCCESSION_TRANSFER",
    userId: input.actor._id ?? "",
    details: {
      concessionnaireId: input.concessionnaireId,
      produitCode: sourceContrat.produitCode,
      reference: dossierReference,
    },
  });
  return {
    autoDossierContratId: inserted.insertedId.toHexString(),
    autoDossierContratReference: dossierReference,
  };
}

export async function advanceSuccessionCase(input: AdvanceSuccessionInput): Promise<SuccessionCaseDocument> {
  if (!ObjectId.isValid(input.caseId)) throw new Error("CASE_NOT_FOUND");
  if (input.actor.role === "AGENT") throw new Error("ROLE_FORBIDDEN");

  const db = await getDatabase();
  const row = await db.collection<StoredSuccession>(COLLECTION).findOne({
    _id: new ObjectId(input.caseId),
    deletedAt: null,
  });
  if (!row) throw new Error("CASE_NOT_FOUND");
  if (row.status !== "OUVERT") throw new Error("CASE_ALREADY_CLOSED");

  const conc = await findConcessionnaireById(row.concessionnaireId);
  if (!conc || conc.deletedAt) throw new Error("CONCESSIONNAIRE_NOT_FOUND");
  if (!canReadConcessionnaire(input.actor, conc)) throw new Error("AGENCE_FORBIDDEN");

  const len = row.stepHistory.length;
  const nextKey = nextStepKey(len);
  if (!nextKey) throw new Error("ALL_STEPS_DONE");

  if (nextKey === "IDENTIFICATION_AYANT_DROIT") {
    const nom = input.ayantDroitNom?.trim();
    const lien = input.ayantDroitLienParente?.trim();
    const telephone = input.ayantDroitTelephone?.trim();
    const email = input.ayantDroitEmail?.trim();
    if (!nom) throw new Error("AYANT_DROIT_NOM_REQUIRED");
    if (!lien) throw new Error("AYANT_DROIT_LIEN_REQUIRED");
    if (!telephone && !email) throw new Error("AYANT_DROIT_CONTACT_REQUIRED");
  }

  if (nextKey === "VERIFICATION_JURIDIQUE") {
    if (!row.documents.length) throw new Error("SUCCESSION_DOCUMENTS_REQUIRED");
  }

  if (nextKey === "DECISION") {
    if (input.actor.role !== "CHEF_SERVICE") throw new Error("DECISION_CHEF_SERVICE_ONLY");
    if (!input.decisionType) throw new Error("DECISION_TYPE_REQUIRED");
    if (row.stepHistory.length !== SUCCESSION_STEPS.length - 1) {
      throw new Error("SUCCESSION_STEPS_INCOMPLETE");
    }
  }

  const now = new Date();
  const newHistory = [
    ...row.stepHistory,
    {
      step: nextKey,
      completedAt: now,
      completedByUserId: input.actor._id ?? "",
      comment: input.comment,
    },
  ];

  const $set: Record<string, unknown> = {
    stepHistory: newHistory,
    updatedAt: now,
    updatedByUserId: input.actor._id ?? "",
  };

  if (nextKey === "IDENTIFICATION_AYANT_DROIT") {
    $set.ayantDroitNom = input.ayantDroitNom?.trim() ?? null;
    $set.ayantDroitLienParente = input.ayantDroitLienParente?.trim() ?? null;
    $set.ayantDroitTelephone = input.ayantDroitTelephone?.trim() ?? null;
    $set.ayantDroitEmail = input.ayantDroitEmail?.trim()?.toLowerCase() ?? null;
  }

  if (nextKey === "DECISION") {
    const decisionType = input.decisionType;
    if (!decisionType) throw new Error("DECISION_TYPE_REQUIRED");
    const decidedAt = now;
    const decidedByUserId = input.actor._id ?? "";
    const decisionEffects = await applyDecisionEffects({
      concessionnaireId: row.concessionnaireId,
      decisionType,
      actor: input.actor,
    });
    $set.decision = {
      type: decisionType,
      decidedAt,
      decidedByUserId,
      comment: input.comment ?? null,
      ...(decisionEffects.autoDossierContratId
        ? {
            autoDossierContratId: decisionEffects.autoDossierContratId,
            autoDossierContratReference: decisionEffects.autoDossierContratReference,
          }
        : {}),
    };
  }

  let newStatus: SuccessionCaseDocument["status"] = "OUVERT";
  if (newHistory.length >= SUCCESSION_STEPS.length) {
    newStatus = "CLOTURE";
    $set.status = "CLOTURE";
  }

  await db.collection<StoredSuccession>(COLLECTION).updateOne(
    { _id: row._id, deletedAt: null },
    { $set },
  );

  const updated = await db.collection<StoredSuccession>(COLLECTION).findOne({ _id: row._id });
  if (!updated) throw new Error("CASE_NOT_FOUND");

  await appendAuditLog({
    entityType: "SUCCESSION",
    entityId: input.caseId,
    action: newStatus === "CLOTURE" ? "CLOTURE" : "STEP_ADVANCE",
    userId: input.actor._id ?? "",
    details: { step: nextKey },
  });

  return mapRow(updated);
}

export async function addSuccessionDocument(input: {
  caseId: string;
  filename: string;
  mimeType: string;
  size: number;
  storedRelativePath: string;
  actorId: string;
}) {
  if (!ObjectId.isValid(input.caseId)) throw new Error("CASE_NOT_FOUND");
  const db = await getDatabase();
  const now = new Date();
  const doc = {
    id: randomUUID(),
    filename: input.filename,
    mimeType: input.mimeType,
    size: input.size,
    storedRelativePath: input.storedRelativePath,
    uploadedAt: now,
    uploadedByUserId: input.actorId,
  };
  const r = await db.collection<StoredSuccession>(COLLECTION).updateOne(
    { _id: new ObjectId(input.caseId), deletedAt: null },
    { $push: { documents: doc }, $set: { updatedAt: now, updatedByUserId: input.actorId } },
  );
  if (r.matchedCount === 0) throw new Error("CASE_NOT_FOUND");
  return doc.id;
}

export async function findSuccessionCaseById(id: string): Promise<SuccessionCaseDocument | null> {
  if (!ObjectId.isValid(id)) return null;
  const db = await getDatabase();
  const row = await db.collection<StoredSuccession>(COLLECTION).findOne({
    _id: new ObjectId(id),
    deletedAt: null,
  });
  return row ? mapRow(row) : null;
}

export async function listSuccessionCases(
  page: number,
  pageSize: number,
  scopeAgenceId: string | null | undefined,
  status?: SuccessionCaseDocument["status"],
  filters?: {
    concessionnaireId?: string;
    decisionType?: "TRANSFERT" | "RESILIATION";
    dateFrom?: Date;
    dateTo?: Date;
  },
) {
  const db = await getDatabase();
  const filter: Record<string, unknown> = { deletedAt: null };
  if (scopeAgenceId) filter.agenceId = scopeAgenceId;
  if (status) filter.status = status;
  if (filters?.concessionnaireId) filter.concessionnaireId = filters.concessionnaireId;
  if (filters?.decisionType) filter["decision.type"] = filters.decisionType;
  if (filters?.dateFrom || filters?.dateTo) {
    filter.updatedAt = {};
    if (filters.dateFrom) (filter.updatedAt as { $gte?: Date }).$gte = filters.dateFrom;
    if (filters.dateTo) (filter.updatedAt as { $lte?: Date }).$lte = filters.dateTo;
  }
  const skip = (page - 1) * pageSize;
  const col = db.collection<StoredSuccession>(COLLECTION);
  const [total, rows] = await Promise.all([
    col.countDocuments(filter),
    col.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(pageSize).toArray(),
  ]);
  return {
    items: rows.map((r) => ({
      id: r._id.toHexString(),
      reference: r.reference,
      concessionnaireId: r.concessionnaireId,
      agenceId: r.agenceId,
      status: r.status,
      dateDeces: r.dateDeces ? r.dateDeces.toISOString() : null,
      ayantDroitNom: r.ayantDroitNom,
      ayantDroitTelephone: r.ayantDroitTelephone,
      ayantDroitEmail: r.ayantDroitEmail,
      decisionType: r.decision?.type ?? null,
      autoDossierContratReference: r.decision?.autoDossierContratReference ?? null,
      stepHistory: r.stepHistory.map((s) => ({
        ...s,
        completedAt: s.completedAt.toISOString(),
      })),
      currentStepLabel:
        r.status === "CLOTURE"
          ? null
          : (nextStepKey(r.stepHistory.length) ?? SUCCESSION_STEPS[r.stepHistory.length - 1]),
      stepsCompleted: r.stepHistory.length,
      stepsTotal: SUCCESSION_STEPS.length,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
    total,
    page,
    pageSize,
  };
}

export async function listSuccessionStaleAlerts() {
  const db = await getDatabase();
  const thresholdDays = 30;
  const threshold = new Date(Date.now() - thresholdDays * 24 * 60 * 60 * 1000);
  const rows = await db
    .collection<StoredSuccession>(COLLECTION)
    .find({
      status: "OUVERT",
      deletedAt: null,
      updatedAt: { $lte: threshold },
    })
    .sort({ updatedAt: 1 })
    .limit(200)
    .toArray();

  return rows.map((r) => ({
    id: r._id.toHexString(),
    reference: r.reference,
    concessionnaireId: r.concessionnaireId,
    updatedAt: r.updatedAt.toISOString(),
    daysInactive: Math.floor((Date.now() - r.updatedAt.getTime()) / (24 * 60 * 60 * 1000)),
    stepsCompleted: r.stepHistory.length,
    nextStep: nextStepKey(r.stepHistory.length),
  }));
}
