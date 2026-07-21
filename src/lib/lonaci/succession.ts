import { ObjectId } from "mongodb";
import { randomUUID } from "node:crypto";

import {
  buildWorkflowVisibilityMongoFilter,
  deriveSuccessionVisibilityState,
  isWorkflowDocumentVisible,
  isWorkflowStageAssignedToRole,
} from "@/lib/auth/workflow-visibility";
import { SUCCESSION_STEPS } from "@/lib/lonaci/constants";
import { appendAuditLog } from "@/lib/lonaci/audit";
import {
  buildSuccessionDocumentChecklist,
  isSuccessionChecklistComplete,
  parseSuccessionDocumentChecklist,
  patchSuccessionDocumentChecklistStatuts,
  successionChecklistWithActeDeces,
} from "@/lib/lonaci/succession-document-checklist";
import type { DossierDocumentChecklistPayload, DossierDocumentChecklistStatut } from "@/lib/lonaci/types";
import { canReadConcessionnaire } from "@/lib/lonaci/access";
import { findConcessionnaireById, updateConcessionnaire } from "@/lib/lonaci/concessionnaires";
import type { SuccessionCaseDocument, SuccessionStep, UserDocument } from "@/lib/lonaci/types";
import { successionStatutMetierFields } from "@/lib/lonaci/succession-statut-metier";
import type { SuccessionStatutMetier } from "@/lib/lonaci/succession-statut-metier";
import { successionStaleAlertResetFields } from "@/lib/lonaci/succession-stale-alerts";
import { restrictionToMongoAgenceFilter, type ListAgenceRestriction } from "@/lib/lonaci/list-agence-restriction";
import { getDatabase } from "@/lib/mongodb";
import { prisma } from "@/lib/prisma";

export {
  countSuccessionStaleAlerts,
  dispatchAutomaticSuccessionStaleAlerts,
  listSuccessionStaleAlerts,
} from "@/lib/lonaci/succession-stale-alerts";

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

function requireSuccessionTransitionStage(
  row: StoredSuccession,
  actor: Pick<UserDocument, "_id" | "role">,
): void {
  const successionState = deriveSuccessionVisibilityState(row);
  if (
    !isWorkflowStageAssignedToRole({
      workflow: "SUCCESSIONS",
      role: actor.role,
      status: row.status,
      successionState,
    })
  ) {
    throw new Error("CASE_NOT_FOUND");
  }
}

async function ensureRowDocumentChecklist(row: StoredSuccession): Promise<DossierDocumentChecklistPayload> {
  const parsed = parseSuccessionDocumentChecklist(row.documentChecklist);
  if (parsed?.entries.length) {
    return successionChecklistWithActeDeces(parsed, Boolean(row.acteDeces));
  }
  const built = buildSuccessionDocumentChecklist({ acteDecesUploaded: Boolean(row.acteDeces) });
  const db = await getDatabase();
  await db.collection<StoredSuccession>(COLLECTION).updateOne(
    { _id: row._id },
    { $set: { documentChecklist: built, updatedAt: new Date(), ...successionStaleAlertResetFields() } },
  );
  return built;
}

function mapRow(row: StoredSuccession, documentChecklist: DossierDocumentChecklistPayload | null): SuccessionCaseDocument {
  return {
    ...row,
    documentChecklist,
    _id: row._id.toHexString(),
    validationN1At: row.validationN1At ?? null,
    validationN1ByUserId: row.validationN1ByUserId ?? null,
    validationN2At: row.validationN2At ?? null,
    validationN2ByUserId: row.validationN2ByUserId ?? null,
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
    documentChecklist: buildSuccessionDocumentChecklist({ acteDecesUploaded: true }),
    documents: [],
    decision: null,
    validationN1At: null,
    validationN1ByUserId: null,
    validationN2At: null,
    validationN2ByUserId: null,
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
  const mapped = mapRow(created, doc.documentChecklist ?? null);

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
  requireSuccessionTransitionStage(row, input.actor);
  if (row.status !== "OUVERT") throw new Error("CASE_ALREADY_CLOSED");

  const conc = await findConcessionnaireById(row.concessionnaireId);
  if (!conc || conc.deletedAt) throw new Error("CONCESSIONNAIRE_NOT_FOUND");
  if (!canReadConcessionnaire(input.actor, conc)) throw new Error("CASE_NOT_FOUND");

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
    const checklist = await ensureRowDocumentChecklist(row);
    if (!isSuccessionChecklistComplete(checklist)) {
      throw new Error("SUCCESSION_CHECKLIST_INCOMPLETE");
    }
    if (!row.validationN1At || !row.validationN2At) {
      throw new Error("SUCCESSION_VALIDATION_N1_N2_REQUIRED");
    }
    if (input.actor.role !== "CHEF_SERVICE") {
      throw new Error("VERIFICATION_JURIDIQUE_CHEF_SERVICE_ONLY");
    }
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
    ...successionStaleAlertResetFields(),
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

  const checklist = await ensureRowDocumentChecklist(updated);
  return mapRow(updated, checklist);
}

export async function patchSuccessionDocumentChecklist(input: {
  caseId: string;
  entries: Array<{ itemId: string; statut: DossierDocumentChecklistStatut }>;
  actor: UserDocument;
}): Promise<SuccessionCaseDocument> {
  if (!ObjectId.isValid(input.caseId)) throw new Error("CASE_NOT_FOUND");
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

  const current = await ensureRowDocumentChecklist(row);
  let next = patchSuccessionDocumentChecklistStatuts(current, input.entries);
  next = successionChecklistWithActeDeces(next, Boolean(row.acteDeces));

  const now = new Date();
  await db.collection<StoredSuccession>(COLLECTION).updateOne(
    { _id: row._id },
    {
      $set: {
        documentChecklist: next,
        updatedAt: now,
        updatedByUserId: input.actor._id ?? "",
        ...successionStaleAlertResetFields(),
      },
    },
  );
  const updated = await db.collection<StoredSuccession>(COLLECTION).findOne({ _id: row._id });
  if (!updated) throw new Error("CASE_NOT_FOUND");
  return mapRow(updated, next);
}

export async function recordSuccessionValidationN1(input: { caseId: string; actor: UserDocument }) {
  if (!ObjectId.isValid(input.caseId)) throw new Error("CASE_NOT_FOUND");
  if (input.actor.role !== "CHEF_SECTION") throw new Error("ROLE_FORBIDDEN");
  const db = await getDatabase();
  const row = await db.collection<StoredSuccession>(COLLECTION).findOne({
    _id: new ObjectId(input.caseId),
    deletedAt: null,
  });
  if (!row) throw new Error("CASE_NOT_FOUND");
  requireSuccessionTransitionStage(row, input.actor);
  if (row.status !== "OUVERT") throw new Error("CASE_ALREADY_CLOSED");
  if (row.stepHistory.length < 2) throw new Error("SUCCESSION_STEP_ORDER");
  if (row.validationN1At) throw new Error("SUCCESSION_VALIDATION_ALREADY_DONE");
  const checklistN1 = await ensureRowDocumentChecklist(row);
  if (!isSuccessionChecklistComplete(checklistN1)) {
    throw new Error("SUCCESSION_CHECKLIST_INCOMPLETE");
  }
  const conc = await findConcessionnaireById(row.concessionnaireId);
  if (!conc || conc.deletedAt) throw new Error("CONCESSIONNAIRE_NOT_FOUND");
  if (!canReadConcessionnaire(input.actor, conc)) throw new Error("CASE_NOT_FOUND");
  const now = new Date();
  await db.collection(COLLECTION).updateOne(
    { _id: row._id },
    {
      $set: {
        validationN1At: now,
        validationN1ByUserId: input.actor._id ?? "",
        updatedAt: now,
        updatedByUserId: input.actor._id ?? "",
        ...successionStaleAlertResetFields(),
      },
    },
  );
  const updated = await db.collection<StoredSuccession>(COLLECTION).findOne({ _id: row._id });
  if (!updated) throw new Error("CASE_NOT_FOUND");
  const checklist = await ensureRowDocumentChecklist(updated);
  return mapRow(updated, checklist);
}

export async function recordSuccessionValidationN2(input: { caseId: string; actor: UserDocument }) {
  if (!ObjectId.isValid(input.caseId)) throw new Error("CASE_NOT_FOUND");
  if (input.actor.role !== "ASSIST_CDS") throw new Error("ROLE_FORBIDDEN");
  const db = await getDatabase();
  const row = await db.collection<StoredSuccession>(COLLECTION).findOne({
    _id: new ObjectId(input.caseId),
    deletedAt: null,
  });
  if (!row) throw new Error("CASE_NOT_FOUND");
  requireSuccessionTransitionStage(row, input.actor);
  if (row.status !== "OUVERT") throw new Error("CASE_ALREADY_CLOSED");
  if (!row.validationN1At) throw new Error("SUCCESSION_VALIDATION_N1_REQUIRED");
  if (row.validationN2At) throw new Error("SUCCESSION_VALIDATION_ALREADY_DONE");
  const conc = await findConcessionnaireById(row.concessionnaireId);
  if (!conc || conc.deletedAt) throw new Error("CONCESSIONNAIRE_NOT_FOUND");
  if (!canReadConcessionnaire(input.actor, conc)) throw new Error("CASE_NOT_FOUND");
  const now = new Date();
  await db.collection(COLLECTION).updateOne(
    { _id: row._id },
    {
      $set: {
        validationN2At: now,
        validationN2ByUserId: input.actor._id ?? "",
        updatedAt: now,
        updatedByUserId: input.actor._id ?? "",
        ...successionStaleAlertResetFields(),
      },
    },
  );
  const updated = await db.collection<StoredSuccession>(COLLECTION).findOne({ _id: row._id });
  if (!updated) throw new Error("CASE_NOT_FOUND");
  const checklist = await ensureRowDocumentChecklist(updated);
  return mapRow(updated, checklist);
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
    {
      $push: { documents: doc },
      $set: { updatedAt: now, updatedByUserId: input.actorId, ...successionStaleAlertResetFields() },
    },
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
  if (!row) return null;
  const checklist = await ensureRowDocumentChecklist(row);
  return mapRow(row, checklist);
}

export async function findVisibleSuccessionCaseById(
  id: string,
  actor: UserDocument,
): Promise<SuccessionCaseDocument | null> {
  const successionCase = await findSuccessionCaseById(id);
  if (!successionCase) return null;
  if (
    !isWorkflowDocumentVisible({
      workflow: "SUCCESSIONS",
      role: actor.role,
      userId: actor._id ?? "",
      creatorId: successionCase.createdByUserId,
      status: successionCase.status,
      successionState: deriveSuccessionVisibilityState(successionCase),
    })
  ) {
    return null;
  }
  const concessionnaire = await findConcessionnaireById(successionCase.concessionnaireId);
  if (
    !concessionnaire ||
    concessionnaire.deletedAt ||
    !canReadConcessionnaire(actor, concessionnaire)
  ) {
    return null;
  }
  return successionCase;
}

export async function listSuccessionCases(
  page: number,
  pageSize: number,
  agenceRestriction: ListAgenceRestriction,
  status?: SuccessionCaseDocument["status"],
  filters?: {
    concessionnaireId?: string;
    decisionType?: "TRANSFERT" | "RESILIATION";
    statutMetier?: SuccessionStatutMetier;
    dateFrom?: Date;
    dateTo?: Date;
    visibility?: Pick<UserDocument, "_id" | "role">;
  },
) {
  const db = await getDatabase();
  const filter: Record<string, unknown> = { deletedAt: null };
  const agenceMongo = restrictionToMongoAgenceFilter(agenceRestriction);
  if (agenceMongo) filter.agenceId = agenceMongo;
  if (status) filter.status = status;
  if (filters?.concessionnaireId) filter.concessionnaireId = filters.concessionnaireId;
  if (filters?.decisionType) filter["decision.type"] = filters.decisionType;
  if (filters?.dateFrom || filters?.dateTo) {
    filter.updatedAt = {};
    if (filters.dateFrom) (filter.updatedAt as { $gte?: Date }).$gte = filters.dateFrom;
    if (filters.dateTo) (filter.updatedAt as { $lte?: Date }).$lte = filters.dateTo;
  }
  const visibilityFilter = filters?.visibility
    ? buildWorkflowVisibilityMongoFilter({
        workflow: "SUCCESSIONS",
        role: filters.visibility.role,
        userId: filters.visibility._id ?? "",
      })
    : null;
  const effectiveFilter: Record<string, unknown> = visibilityFilter
    ? { $and: [filter, visibilityFilter] }
    : filter;
  const skip = (page - 1) * pageSize;
  const col = db.collection<StoredSuccession>(COLLECTION);
  const [total, rows] = await Promise.all([
    col.countDocuments(effectiveFilter),
    col.find(effectiveFilter).sort({ updatedAt: -1 }).skip(skip).limit(pageSize).toArray(),
  ]);
  const itemsRaw = await Promise.all(
    rows.map(async (r) => {
      const checklist = await ensureRowDocumentChecklist(r);
      const currentStepLabel =
        r.status === "CLOTURE"
          ? null
          : (nextStepKey(r.stepHistory.length) ?? SUCCESSION_STEPS[r.stepHistory.length - 1]);
      const metier = successionStatutMetierFields({
        status: r.status,
        decisionType: r.decision?.type ?? null,
        checklistComplet: checklist.complet,
        validationN1At: r.validationN1At,
        validationN2At: r.validationN2At,
        stepHistory: r.stepHistory,
        currentStepLabel,
      });
      return {
      id: r._id.toHexString(),
      reference: r.reference,
      concessionnaireId: r.concessionnaireId,
      agenceId: r.agenceId,
      status: r.status,
      ...metier,
      documentChecklist: checklist,
      checklistComplet: checklist.complet,
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
      currentStepLabel,
      stepsCompleted: r.stepHistory.length,
      stepsTotal: SUCCESSION_STEPS.length,
      validationN1At: r.validationN1At ? r.validationN1At.toISOString() : null,
      validationN1ByUserId: r.validationN1ByUserId ?? null,
      validationN2At: r.validationN2At ? r.validationN2At.toISOString() : null,
      validationN2ByUserId: r.validationN2ByUserId ?? null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
    }),
  );

  const items = filters?.statutMetier
    ? itemsRaw.filter((row) => row.statutMetier === filters.statutMetier)
    : itemsRaw;

  return {
    items,
    total: filters?.statutMetier ? items.length : total,
    page,
    pageSize,
  };
}

