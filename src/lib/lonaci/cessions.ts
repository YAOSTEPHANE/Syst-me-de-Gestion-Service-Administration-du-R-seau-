import { randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";

import {
  buildWorkflowVisibilityMongoFilter,
  isWorkflowDocumentVisible,
  type HierarchicalWorkflow,
} from "@/lib/auth/workflow-visibility";
import { appendAuditLog } from "@/lib/lonaci/audit";
import { canReadCessionScopeForUser } from "@/lib/lonaci/access";
import {
  buildDocumentChecklistForKind,
  isDocumentChecklistCompleteForKind,
  kindHasDocumentChecklist,
  parseDocumentChecklistForKind,
  patchDocumentChecklistStatutsForKind,
  usesSimplifiedDelocalisationCircuit,
  type CessionDossierKind,
} from "@/lib/lonaci/cession-dossier-checklist";
import {
  findConcessionnaireById,
  softDeleteConcessionnaire,
  updateConcessionnaire,
} from "@/lib/lonaci/concessionnaires";
import { listProduits } from "@/lib/lonaci/referentials";
import { roleMayAdvanceWorkflow } from "@/lib/lonaci/workflow-approvals";
import { hasActiveContractForProduct, markActiveContratAsCedeForProduct } from "@/lib/lonaci/contracts";
import { notifyRoleTargets } from "@/lib/lonaci/notifications";
import { type DossierDocumentChecklistPayload, type DossierDocumentChecklistStatut, type UserDocument, userDisplayName } from "@/lib/lonaci/types";
import { sendSmtpEmail } from "@/lib/email/smtp";
import { cessionOperationDisplayStatutFields } from "@/lib/lonaci/cession-operation-statut-metier";
import {
  buildCessionExportRows,
  buildCessionsMongoFilter,
  type CessionsListFilters,
} from "@/lib/lonaci/cessions-export";
import { getDatabase } from "@/lib/mongodb";

export type { CessionsListFilters } from "@/lib/lonaci/cessions-export";
export { buildCessionsMongoFilter, CESSION_STATUT_LABELS } from "@/lib/lonaci/cessions-export";

const COLLECTION = "cessions";
const COUNTERS_COLLECTION = "counters";
const REF_COUNTER_ID = "cession_ref";

export type CessionStatus =
  | "SAISIE_AGENT"
  | "CONTROLE_CHEF_SECTION"
  | "VALIDATION_N2"
  | "VALIDEE_CHEF_SERVICE"
  | "REJETEE";
export type CessionKind = CessionDossierKind;

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
  acteGenereAt: Date | null;
  acteDelocalisationGenereAt: Date | null;
  linkedOperationId: string | null;
  documentChecklist: DossierDocumentChecklistPayload | null;
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
  acteGenereAt: string | null;
  acteDelocalisationGenereAt: string | null;
  linkedOperationId: string | null;
  statutMetierLabel: string;
  statutMetierDescription: string;
  commentaire: string | null;
  documentChecklist: DossierDocumentChecklistPayload | null;
  attachmentsCount: number;
  attachments: Array<{ id: string; filename: string; mimeType: string; size: number; uploadedAt: string }>;
  createdAt: string;
  updatedAt: string;
}

function mapCession(row: CessionStored): CessionListItem {
  const documentChecklist = kindHasDocumentChecklist(row.kind)
    ? parseDocumentChecklistForKind(row.kind, row.documentChecklist)
    : null;
  const display = cessionOperationDisplayStatutFields({
    kind: row.kind,
    statut: row.statut,
    checklistComplet: documentChecklist?.complet ?? null,
    acteGenereAt: row.acteGenereAt,
  });
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
    acteGenereAt: row.acteGenereAt?.toISOString() ?? null,
    acteDelocalisationGenereAt: row.acteDelocalisationGenereAt?.toISOString() ?? null,
    linkedOperationId: row.linkedOperationId,
    statutMetierLabel: display.statutMetierLabel,
    statutMetierDescription: display.statutMetierDescription,
    commentaire: row.commentaire,
    documentChecklist,
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

function workflowForCessionKind(kind: CessionKind): HierarchicalWorkflow {
  return usesSimplifiedDelocalisationCircuit(kind) ? "DELOCALISATIONS" : "CESSIONS";
}

async function canAccessCession(row: CessionStored, actor: UserDocument): Promise<boolean> {
  if (
    !actor._id ||
    !isWorkflowDocumentVisible({
      workflow: workflowForCessionKind(row.kind),
      role: actor.role,
      userId: actor._id,
      creatorId: row.createdByUserId,
      status: row.statut,
    })
  ) {
    return false;
  }
  return await canReadCessionScopeForUser(actor, {
    concessionnaireId: row.concessionnaireId,
    cedantId: row.cedantId,
    beneficiaireId: row.beneficiaireId,
  });
}

function buildCessionVisibilityFilter(input: Pick<CessionsListFilters, "kind"> & { actor: UserDocument }) {
  const common = {
    role: input.actor.role,
    userId: input.actor._id ?? "",
    statusField: "statut",
  };
  if (input.kind) {
    return buildWorkflowVisibilityMongoFilter({
      ...common,
      workflow: workflowForCessionKind(input.kind),
    });
  }
  const delocalisations = buildWorkflowVisibilityMongoFilter({
    ...common,
    workflow: "DELOCALISATIONS",
  });
  const cessions = buildWorkflowVisibilityMongoFilter({
    ...common,
    workflow: "CESSIONS",
  });
  if (!delocalisations || !cessions) return null;
  return {
    $or: [
      { $and: [{ kind: "DELOCALISATION" }, delocalisations] },
      {
        $and: [
          { kind: { $in: ["CESSION", "CESSION_DELOCALISATION"] } },
          cessions,
        ],
      },
    ],
  };
}

export async function ensureCessionIndexes() {
  const db = await getDatabase();
  await db.collection<CessionStored>(COLLECTION).createIndexes([
    { key: { reference: 1 }, unique: true, name: "uniq_reference" },
    { key: { kind: 1, statut: 1, updatedAt: -1 }, name: "idx_kind_status_updated" },
    { key: { statut: 1, updatedAt: -1 }, name: "idx_status_updated" },
    { key: { dateDemande: -1 }, name: "idx_date_demande" },
    { key: { kind: 1, dateDemande: -1 }, name: "idx_kind_date_demande" },
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
  const actionBy = userDisplayName(input.actor);
  let cedant = null;
  let beneficiaire = null;
  let concessionnaire = null;
  const produitCodeNorm = input.produitCode?.trim().toUpperCase() ?? null;

  if (input.kind === "CESSION" || input.kind === "CESSION_DELOCALISATION") {
    if (!input.cedantId || !input.beneficiaireId || !produitCodeNorm) {
      throw new Error("CESSION_FIELDS_REQUIRED");
    }
    if (input.cedantId === input.beneficiaireId) throw new Error("BENEFICIAIRE_DOIT_DIFFERER");
    const hasActive = await hasActiveContractForProduct(input.cedantId, produitCodeNorm);
    if (!hasActive) throw new Error("CONTRAT_SOURCE_INACTIF");
    [cedant, beneficiaire] = await Promise.all([
      findConcessionnaireById(input.cedantId),
      findConcessionnaireById(input.beneficiaireId),
    ]);
    if (!cedant || cedant.deletedAt) throw new Error("CEDANT_NOT_FOUND");
    if (!beneficiaire || beneficiaire.deletedAt) throw new Error("BENEFICIAIRE_NOT_FOUND");
  }

  if (input.kind === "DELOCALISATION") {
    if (
      !input.concessionnaireId ||
      !produitCodeNorm ||
      !input.newAdresse ||
      !input.newAgenceId ||
      !input.newGps
    ) {
      throw new Error("DELOCALISATION_FIELDS_REQUIRED");
    }
    concessionnaire = await findConcessionnaireById(input.concessionnaireId);
    if (!concessionnaire || concessionnaire.deletedAt) throw new Error("CONCESSIONNAIRE_NOT_FOUND");
    const hasActive = await hasActiveContractForProduct(input.concessionnaireId, produitCodeNorm);
    if (!hasActive) throw new Error("CONTRAT_SOURCE_INACTIF");
  }

  if (input.kind === "CESSION_DELOCALISATION") {
    if (!input.newAdresse || !input.newAgenceId || !input.newGps) {
      throw new Error("CESSION_DELOCALISATION_FIELDS_REQUIRED");
    }
  }

  const db = await getDatabase();
  const now = new Date();
  const reference = await nextReference();
  const produits = kindHasDocumentChecklist(input.kind) ? await listProduits() : [];
  const documentChecklist = kindHasDocumentChecklist(input.kind)
    ? buildDocumentChecklistForKind(input.kind, produitCodeNorm, produits)
    : null;
  const linkedOperationId = input.kind === "CESSION_DELOCALISATION" ? randomUUID() : null;

  const doc: Omit<CessionStored, "_id"> = {
    reference,
    kind: input.kind,
    concessionnaireId: input.kind === "DELOCALISATION" ? input.concessionnaireId ?? null : null,
    cedantId:
      input.kind === "CESSION" || input.kind === "CESSION_DELOCALISATION" ? input.cedantId ?? null : null,
    beneficiaireId:
      input.kind === "CESSION" || input.kind === "CESSION_DELOCALISATION" ? input.beneficiaireId ?? null : null,
    produitCode: produitCodeNorm,
    oldAdresse:
      input.kind === "DELOCALISATION"
        ? input.oldAdresse?.trim() || concessionnaire?.adresse || null
        : input.kind === "CESSION_DELOCALISATION"
          ? input.oldAdresse?.trim() || cedant?.adresse || null
          : null,
    oldAgenceId:
      input.kind === "DELOCALISATION"
        ? input.oldAgenceId || concessionnaire?.agenceId || null
        : input.kind === "CESSION_DELOCALISATION"
          ? input.oldAgenceId || cedant?.agenceId || null
          : null,
    newAdresse:
      input.kind === "DELOCALISATION" || input.kind === "CESSION_DELOCALISATION"
        ? input.newAdresse?.trim() || null
        : null,
    newAgenceId:
      input.kind === "DELOCALISATION" || input.kind === "CESSION_DELOCALISATION"
        ? input.newAgenceId || null
        : null,
    newGps:
      input.kind === "DELOCALISATION" || input.kind === "CESSION_DELOCALISATION" ? input.newGps ?? null : null,
    dateDemande: input.dateDemande,
    motif: input.motif.trim(),
    statut: "SAISIE_AGENT",
    commentaire: input.commentaire?.trim() || null,
    attachments: [],
    controlledAt: null,
    controlledByUserId: null,
    validatedAt: null,
    validatedByUserId: null,
    acteGenereAt: null,
    acteDelocalisationGenereAt: null,
    linkedOperationId,
    documentChecklist,
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
      linkedOperationId: doc.linkedOperationId,
    },
  });

  const notifyTitle =
    input.kind === "CESSION"
      ? "Nouvelle demande de cession"
      : input.kind === "CESSION_DELOCALISATION"
        ? "Nouvelle demande cession-délocalisation"
        : "Nouvelle demande de délocalisation";

  await notifyRoleTargets(
    "CHEF_SECTION",
    notifyTitle,
    `Opération ${input.kind.toLowerCase()} | référence ${reference} | action contrôle N1 attendu | acteur ${actionBy}.`,
    { cessionId: r.insertedId.toHexString(), reference },
    doc.oldAgenceId,
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

async function ensureDocumentChecklistStored(row: CessionStored): Promise<CessionStored> {
  if (!kindHasDocumentChecklist(row.kind)) return row;
  const parsed = parseDocumentChecklistForKind(row.kind, row.documentChecklist);
  if (parsed?.entries.length) return row;
  const produits = await listProduits();
  const checklist = buildDocumentChecklistForKind(row.kind, row.produitCode, produits);
  const db = await getDatabase();
  const now = new Date();
  await db.collection<CessionStored>(COLLECTION).updateOne(
    { _id: row._id },
    { $set: { documentChecklist: checklist, updatedAt: now } },
  );
  return { ...row, documentChecklist: checklist };
}

export async function getCessionById(id: string, actor: UserDocument): Promise<CessionListItem | null> {
  if (!ObjectId.isValid(id)) return null;
  const db = await getDatabase();
  let row = await db.collection<CessionStored>(COLLECTION).findOne({ _id: new ObjectId(id), deletedAt: null });
  if (!row || !(await canAccessCession(row, actor))) return null;
  if (kindHasDocumentChecklist(row.kind)) {
    row = await ensureDocumentChecklistStored(row);
  }
  return mapCession(row);
}

export async function patchCessionDocumentChecklist(input: {
  id: string;
  entries: Array<{ itemId: string; statut: DossierDocumentChecklistStatut }>;
  actor: UserDocument;
}): Promise<CessionListItem> {
  if (!ObjectId.isValid(input.id)) throw new Error("CESSION_NOT_FOUND");
  const db = await getDatabase();
  const row = await db.collection<CessionStored>(COLLECTION).findOne({ _id: new ObjectId(input.id), deletedAt: null });
  if (!row || !(await canAccessCession(row, input.actor))) throw new Error("CESSION_NOT_FOUND");
  if (!kindHasDocumentChecklist(row.kind)) throw new Error("CHECKLIST_NOT_SUPPORTED");
  const current = parseDocumentChecklistForKind(row.kind, row.documentChecklist);
  if (!current?.entries.length) throw new Error("CHECKLIST_NOT_FOUND");
  const next = patchDocumentChecklistStatutsForKind(row.kind, current, input.entries);
  const now = new Date();
  await db.collection<CessionStored>(COLLECTION).updateOne(
    { _id: row._id },
    {
      $set: {
        documentChecklist: next,
        updatedAt: now,
        updatedByUserId: input.actor._id ?? "",
      },
    },
  );
  const updated = await db.collection<CessionStored>(COLLECTION).findOne({ _id: row._id });
  if (!updated) throw new Error("CESSION_NOT_FOUND");
  return mapCession(updated);
}

export async function listCessions(input: {
  page: number;
  pageSize: number;
  actor: UserDocument;
} & CessionsListFilters) {
  const db = await getDatabase();
  const filter = await buildCessionsMongoFilter(input);
  const visibility = buildCessionVisibilityFilter(input);
  filter.$and = visibility ? [visibility] : [{ _id: { $in: [] } }];
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

const CESSION_EXPORT_MAX = 10_000;

export async function listCessionsForExport(filters: CessionsListFilters & { actor: UserDocument }) {
  const db = await getDatabase();
  const filter = await buildCessionsMongoFilter(filters);
  const visibility = buildCessionVisibilityFilter(filters);
  filter.$and = visibility ? [visibility] : [{ _id: { $in: [] } }];
  const rows = await db
    .collection<CessionStored>(COLLECTION)
    .find(filter)
    .sort({ dateDemande: -1, reference: 1 })
    .limit(CESSION_EXPORT_MAX)
    .toArray();
  const exportRows = await buildCessionExportRows(rows);
  return { rows, exportRows, truncated: rows.length >= CESSION_EXPORT_MAX };
}

/** Horodatage de la première génération de l’acte, qui déclenche le statut métier ACTE GÉNÉRÉ. */
export async function markActeCessionGenere(cessionId: string) {
  if (!ObjectId.isValid(cessionId)) return;
  const db = await getDatabase();
  const now = new Date();
  await db.collection<CessionStored>(COLLECTION).updateOne(
    {
      _id: new ObjectId(cessionId),
      deletedAt: null,
      kind: { $in: ["CESSION", "CESSION_DELOCALISATION"] },
      acteGenereAt: null,
    },
    { $set: { acteGenereAt: now, updatedAt: now } },
  );
}

/** Horodatage de la première génération de l’acte de délocalisation. */
export async function markActeDelocalisationGenere(cessionId: string) {
  if (!ObjectId.isValid(cessionId)) return;
  const db = await getDatabase();
  const now = new Date();
  await db.collection<CessionStored>(COLLECTION).updateOne(
    {
      _id: new ObjectId(cessionId),
      deletedAt: null,
      kind: { $in: ["DELOCALISATION", "CESSION_DELOCALISATION"] },
      acteDelocalisationGenereAt: null,
    },
    { $set: { acteDelocalisationGenereAt: now, updatedAt: now } },
  );
}

/** Lecture avec les identifiants nécessaires au contrôle d’accès agence / PDV. */
export async function getCessionAttachmentWithScope(input: {
  id: string;
  attachmentId: string;
  actor: UserDocument;
}) {
  if (!ObjectId.isValid(input.id)) return null;
  const db = await getDatabase();
  const row = await db.collection<CessionStored>(COLLECTION).findOne({ _id: new ObjectId(input.id), deletedAt: null });
  if (!row || !(await canAccessCession(row, input.actor))) return null;
  const attachment = row.attachments.find((a) => a.id === input.attachmentId);
  if (!attachment) return null;
  return {
    attachment,
    concessionnaireId: row.concessionnaireId,
    cedantId: row.cedantId,
    beneficiaireId: row.beneficiaireId,
  };
}

export function assertCessionTransitionAllowed(
  role: string,
  from: CessionStatus,
  target: CessionStatus,
  kind: CessionKind,
) {
  if (usesSimplifiedDelocalisationCircuit(kind)) {
    if (from === "SAISIE_AGENT" && target === "CONTROLE_CHEF_SECTION") {
      if (!roleMayAdvanceWorkflow(role, "CHEF_SECTION")) throw new Error("FORBIDDEN_TRANSITION");
      return;
    }
    if (from === "CONTROLE_CHEF_SECTION" && target === "VALIDEE_CHEF_SERVICE") {
      if (!roleMayAdvanceWorkflow(role, "CHEF_SERVICE")) throw new Error("FORBIDDEN_TRANSITION");
      return;
    }
    if (target === "REJETEE") {
      const expectedRole = from === "SAISIE_AGENT"
        ? "CHEF_SECTION"
        : from === "CONTROLE_CHEF_SECTION"
          ? "CHEF_SERVICE"
          : null;
      if (!expectedRole || !roleMayAdvanceWorkflow(role, expectedRole)) {
        throw new Error("FORBIDDEN_TRANSITION");
      }
      return;
    }
    throw new Error("INVALID_TRANSITION");
  }

  if (from === "SAISIE_AGENT" && target === "CONTROLE_CHEF_SECTION") {
    if (!roleMayAdvanceWorkflow(role, "CHEF_SECTION")) throw new Error("FORBIDDEN_TRANSITION");
    return;
  }
  if (from === "CONTROLE_CHEF_SECTION" && target === "VALIDATION_N2") {
    if (!roleMayAdvanceWorkflow(role, "ASSIST_CDS")) throw new Error("FORBIDDEN_TRANSITION");
    return;
  }
  if (from === "VALIDATION_N2" && target === "VALIDEE_CHEF_SERVICE") {
    if (!roleMayAdvanceWorkflow(role, "CHEF_SERVICE")) throw new Error("FORBIDDEN_TRANSITION");
    return;
  }
  if (target === "REJETEE") {
    const expectedRole = from === "SAISIE_AGENT"
      ? "CHEF_SECTION"
      : from === "CONTROLE_CHEF_SECTION"
        ? "ASSIST_CDS"
        : from === "VALIDATION_N2"
          ? "CHEF_SERVICE"
          : null;
    if (!expectedRole || !roleMayAdvanceWorkflow(role, expectedRole)) {
      throw new Error("FORBIDDEN_TRANSITION");
    }
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
  const actionBy = userDisplayName(input.actor);
  if (!ObjectId.isValid(input.id)) throw new Error("CESSION_NOT_FOUND");

  const db = await getDatabase();
  const row = await db.collection<CessionStored>(COLLECTION).findOne({ _id: new ObjectId(input.id), deletedAt: null });
  if (!row || !(await canAccessCession(row, input.actor))) throw new Error("CESSION_NOT_FOUND");

  assertCessionTransitionAllowed(input.actor.role, row.statut, input.target, row.kind);

  if (input.target === "CONTROLE_CHEF_SECTION" && kindHasDocumentChecklist(row.kind)) {
    const checklist = parseDocumentChecklistForKind(row.kind, row.documentChecklist);
    if (!isDocumentChecklistCompleteForKind(row.kind, checklist)) {
      throw new Error("CHECKLIST_INCOMPLETE");
    }
  }

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
    if (!usesSimplifiedDelocalisationCircuit(row.kind)) {
      await notifyRoleTargets(
        "ASSIST_CDS",
        "Cession / délocalisation : validation N2 attendue",
        `Opération ${row.kind.toLowerCase()} | référence ${row.reference} | action validation N2 attendue | acteur ${actionBy}.`,
        { cessionId: input.id, reference: row.reference },
        row.oldAgenceId,
      );
    } else {
      await notifyRoleTargets(
        "CHEF_SERVICE",
        "Délocalisation : validation finale attendue",
        `Opération délocalisation | référence ${row.reference} | validation Chef de Service attendue | acteur ${actionBy}.`,
        { cessionId: input.id, reference: row.reference },
        row.oldAgenceId,
      );
    }
  }
  if (input.target === "VALIDATION_N2") {
    await notifyRoleTargets(
      "CHEF_SERVICE",
      "Cession / délocalisation : validation finale attendue",
      `Opération ${row.kind.toLowerCase()} | référence ${row.reference} | action validation finale (chef de service) attendue | acteur ${actionBy}.`,
      { cessionId: input.id, reference: row.reference },
      row.oldAgenceId,
    );
  }
  if (input.target === "VALIDEE_CHEF_SERVICE") {
    $set.validatedAt = now;
    $set.validatedByUserId = input.actor._id;
    if ((row.kind === "CESSION" || row.kind === "CESSION_DELOCALISATION") && !row.acteGenereAt) {
      $set.acteGenereAt = now;
    }
    if (
      (row.kind === "DELOCALISATION" || row.kind === "CESSION_DELOCALISATION") &&
      !row.acteDelocalisationGenereAt
    ) {
      $set.acteDelocalisationGenereAt = now;
    }
  }

  await db.collection<CessionStored>(COLLECTION).updateOne({ _id: row._id }, { $set });

  if (input.target === "VALIDEE_CHEF_SERVICE") {
    if (row.kind === "CESSION" || row.kind === "CESSION_DELOCALISATION") {
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
      if (row.kind === "CESSION_DELOCALISATION" && beneficiaire?._id && row.newAgenceId && row.newGps) {
        await updateConcessionnaire(
          beneficiaire._id,
          {
            agenceId: row.newAgenceId,
            gps: row.newGps,
            adresse: row.newAdresse ?? beneficiaire.adresse ?? null,
          },
          input.actor,
        );
        if (cedant?._id) {
          await softDeleteConcessionnaire(cedant._id, input.actor);
        }
        await appendAuditLog({
          entityType: "DOSSIER",
          entityId: input.id,
          action: "CESSION_DELOCALISATION_FINALISEE",
          userId: input.actor._id ?? "",
          details: {
            reference: row.reference,
            linkedOperationId: row.linkedOperationId,
            cedantId: row.cedantId,
            beneficiaireId: row.beneficiaireId,
            newAgenceId: row.newAgenceId,
          },
        });
      }
      const emails = [cedant?.email, beneficiaire?.email]
        .filter((v): v is string => Boolean(v && v.trim()))
        .map((v) => v.trim());
      if (emails.length) {
        const recipients = Array.from(new Set(emails)).join(", ");
        const subject =
          row.kind === "CESSION_DELOCALISATION"
            ? `Cession-délocalisation validée ${row.reference}`
            : `Cession validée ${row.reference}`;
        await sendSmtpEmail(
          emails,
          subject,
          `Opération ${row.kind.toLowerCase()} | référence ${row.reference} | dossier finalisé | acteur ${actionBy} | destinataires ${recipients}.`,
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
          `Opération délocalisation | référence ${row.reference} | action délocalisation validée et fiche mise à jour | acteur ${actionBy}.`,
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

