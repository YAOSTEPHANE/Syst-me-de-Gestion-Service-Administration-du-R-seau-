import { randomBytes } from "crypto";

import { ObjectId } from "mongodb";

import {
  buildWorkflowVisibilityMongoFilter,
  isWorkflowDocumentVisible,
  isWorkflowStageAssignedToRole,
} from "@/lib/auth/workflow-visibility";
import { canReadConcessionnaire } from "@/lib/lonaci/access";
import {
  GRATTAGE_STOCK_ALERT_DEFAULT,
  type ScratchCodeStatut,
  SCRATCH_CODE_STATUTS,
} from "@/lib/lonaci/constants";
import type { LonaciRole } from "@/lib/lonaci/constants";
import type { UserDocument } from "@/lib/lonaci/types";
import { appendAuditLog } from "@/lib/lonaci/audit";
import { findConcessionnaireById } from "@/lib/lonaci/concessionnaires";
import { ensureGrattageContratIndexes, ensureGrattageContratsFromGpr } from "@/lib/lonaci/grattage-contrats";
import { restrictionToPrismaAgenceWhere } from "@/lib/lonaci/list-agence-restriction";
import { prisma } from "@/lib/prisma";
import { getDatabase } from "@/lib/mongodb";

const GPR_REGISTRATIONS_COLLECTION = "gpr_registrations";
const GPR_EXPORT_LOGS_COLLECTION = "gpr_export_logs";
const SCRATCH_LOTS_COLLECTION = "scratch_code_lots";
const SCRATCH_CODES_COLLECTION = "scratch_codes";
const COUNTERS_COLLECTION = "counters";
const GPR_COUNTER_ID = "gpr_registration_ref";
const SCRATCH_LOT_COUNTER_ID = "scratch_lot_ref";

export const GPR_REGISTRATION_STATUSES = [
  "SOUMIS_AGENT",
  "VALIDE_N1",
  "VALIDE_N2",
  "SUIVI_CHEF_SERVICE",
  "REJETE",
] as const;
export type GprRegistrationStatus = (typeof GPR_REGISTRATION_STATUSES)[number];

export const SCRATCH_CODE_STATUSES = SCRATCH_CODE_STATUTS;
export type ScratchCodeStatus = ScratchCodeStatut;

const GPR_ELIGIBLE_STATUSES: GprRegistrationStatus[] = ["VALIDE_N2", "SUIVI_CHEF_SERVICE"];
const SCRATCH_DISTRIBUTED_STATUSES: ScratchCodeStatus[] = ["ATTRIBUE", "ACTIF", "EPUISE"];

type StoredGprRegistration = {
  _id: ObjectId;
  reference: string;
  concessionnaireId: string;
  produitsActifs: string[];
  dateEnregistrement: Date;
  status: GprRegistrationStatus;
  history: Array<{
    from: GprRegistrationStatus | null;
    to: GprRegistrationStatus;
    byUserId: string;
    at: Date;
    comment: string | null;
  }>;
  sync: {
    state: "PENDING" | "SUCCESS" | "FAILED";
    lastAttemptAt: Date | null;
    lastSuccessAt: Date | null;
    attempts: number;
    lastError: string | null;
    remoteId: string | null;
  };
  createdByUserId: string;
  updatedByUserId: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

type StoredGprExportLog = {
  _id: ObjectId;
  exportedAt: Date;
  operatorUserId: string;
  entriesCount: number;
  generatedFilename: string;
};

type StoredScratchLot = {
  _id: ObjectId;
  lotId: string;
  concessionnaireId: string;
  produitCode: string;
  requestedCount: number;
  generatedCount: number;
  status: ScratchCodeStatus;
  attribueAt: Date | null;
  chefSectionValidatedAt: Date | null;
  activatedAt: Date | null;
  exhaustedAt: Date | null;
  history: Array<{
    action: string;
    byUserId: string;
    at: Date;
    details: Record<string, unknown> | null;
  }>;
  createdByUserId: string;
  updatedByUserId: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

type StoredScratchCode = {
  _id: ObjectId;
  lotId: string;
  code: string;
  concessionnaireId: string;
  produitCode: string;
  status: ScratchCodeStatus;
  createdAt: Date;
  updatedAt: Date;
};

async function canAccessGprRegistration(
  row: StoredGprRegistration,
  actor: UserDocument,
): Promise<boolean> {
  if (
    !isWorkflowDocumentVisible({
      workflow: "GPR",
      role: actor.role,
      userId: actor._id ?? "",
      creatorId: row.createdByUserId,
      status: row.status,
    })
  ) {
    return false;
  }
  const concessionnaire = await findConcessionnaireById(row.concessionnaireId);
  return Boolean(
    concessionnaire &&
      !concessionnaire.deletedAt &&
      canReadConcessionnaire(actor, concessionnaire),
  );
}

export async function ensureGprGrattageIndexes() {
  const db = await getDatabase();
  await db.collection<StoredGprRegistration>(GPR_REGISTRATIONS_COLLECTION).createIndexes([
    { key: { reference: 1 }, unique: true, name: "uniq_reference" },
    { key: { concessionnaireId: 1, status: 1 }, name: "idx_concessionnaire_status" },
    { key: { dateEnregistrement: -1 }, name: "idx_date_enregistrement" },
    { key: { "sync.state": 1, updatedAt: -1 }, name: "idx_sync_state" },
  ]);
  await db.collection<StoredGprExportLog>(GPR_EXPORT_LOGS_COLLECTION).createIndexes([
    { key: { exportedAt: -1 }, name: "idx_exported_at" },
  ]);
  await db.collection<StoredScratchLot>(SCRATCH_LOTS_COLLECTION).createIndexes([
    { key: { lotId: 1 }, unique: true, name: "uniq_lot_id" },
    { key: { concessionnaireId: 1, produitCode: 1 }, name: "idx_owner_product" },
    { key: { status: 1, updatedAt: -1 }, name: "idx_status_updated" },
  ]);
  await db.collection<StoredScratchCode>(SCRATCH_CODES_COLLECTION).createIndexes([
    { key: { code: 1 }, unique: true, name: "uniq_code" },
    { key: { lotId: 1, status: 1 }, name: "idx_lot_status" },
  ]);
}

function gprSyncConfig() {
  return {
    endpoint: process.env.GPR_API_ENDPOINT?.trim() ?? "",
    apiKey: process.env.GPR_API_KEY?.trim() ?? "",
    timeoutMs: Number.parseInt(process.env.GPR_API_TIMEOUT_MS?.trim() ?? "15000", 10) || 15000,
    maxRetries: Number.parseInt(process.env.GPR_API_MAX_RETRIES?.trim() ?? "3", 10) || 3,
  };
}

async function nextGprReference() {
  const db = await getDatabase();
  await db.collection<{ _id: string; seq: number }>(COUNTERS_COLLECTION).updateOne(
    { _id: GPR_COUNTER_ID },
    { $inc: { seq: 1 } },
    { upsert: true },
  );
  const counter = await db.collection<{ _id: string; seq: number }>(COUNTERS_COLLECTION).findOne({ _id: GPR_COUNTER_ID });
  return `GPR-${String(counter?.seq ?? 1).padStart(7, "0")}`;
}

async function nextScratchLotId() {
  const db = await getDatabase();
  await db.collection<{ _id: string; seq: number }>(COUNTERS_COLLECTION).updateOne(
    { _id: SCRATCH_LOT_COUNTER_ID },
    { $inc: { seq: 1 } },
    { upsert: true },
  );
  const counter = await db
    .collection<{ _id: string; seq: number }>(COUNTERS_COLLECTION)
    .findOne({ _id: SCRATCH_LOT_COUNTER_ID });
  return `LOT-GR-${String(counter?.seq ?? 1).padStart(7, "0")}`;
}

export async function createGprRegistration(input: {
  concessionnaireId: string;
  produitsActifs: string[];
  dateEnregistrement: Date;
  actor: UserDocument;
}) {
  const db = await getDatabase();
  const now = new Date();
  const status: GprRegistrationStatus = "SOUMIS_AGENT";
  const reference = await nextGprReference();
  const doc: Omit<StoredGprRegistration, "_id"> = {
    reference,
    concessionnaireId: input.concessionnaireId,
    produitsActifs: input.produitsActifs,
    dateEnregistrement: input.dateEnregistrement,
    status,
    history: [{ from: null, to: status, byUserId: input.actor._id ?? "", at: now, comment: null }],
    sync: {
      state: "PENDING",
      lastAttemptAt: null,
      lastSuccessAt: null,
      attempts: 0,
      lastError: null,
      remoteId: null,
    },
    createdByUserId: input.actor._id ?? "",
    updatedByUserId: input.actor._id ?? "",
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  const result = await db.collection<Omit<StoredGprRegistration, "_id">>(GPR_REGISTRATIONS_COLLECTION).insertOne(doc);
  await appendAuditLog({
    entityType: "CONCESSIONNAIRE",
    entityId: input.concessionnaireId,
    action: "GPR_REGISTRATION_CREATE",
    userId: input.actor._id ?? "",
    details: { registrationId: result.insertedId.toHexString(), reference, produitsActifs: input.produitsActifs },
  });
  return { id: result.insertedId.toHexString(), reference };
}

function canTransitionGpr(role: LonaciRole, from: GprRegistrationStatus, to: GprRegistrationStatus) {
  if (from === "SOUMIS_AGENT" && to === "VALIDE_N1") return role === "CHEF_SECTION";
  if (from === "VALIDE_N1" && to === "VALIDE_N2") return role === "ASSIST_CDS";
  if (from === "VALIDE_N2" && to === "SUIVI_CHEF_SERVICE") return role === "CHEF_SERVICE";
  if (to === "REJETE") {
    return isWorkflowStageAssignedToRole({
      workflow: "GPR",
      role,
      status: from,
    });
  }
  return false;
}

export async function transitionGprRegistration(input: {
  registrationId: string;
  targetStatus: GprRegistrationStatus;
  comment: string | null;
  actor: UserDocument;
}) {
  if (!ObjectId.isValid(input.registrationId)) throw new Error("GPR_REGISTRATION_NOT_FOUND");
  const db = await getDatabase();
  const row = await db.collection<StoredGprRegistration>(GPR_REGISTRATIONS_COLLECTION).findOne({
    _id: new ObjectId(input.registrationId),
    deletedAt: null,
  });
  if (!row) throw new Error("GPR_REGISTRATION_NOT_FOUND");
  if (!(await canAccessGprRegistration(row, input.actor))) {
    throw new Error("GPR_REGISTRATION_NOT_FOUND");
  }
  if (!canTransitionGpr(input.actor.role, row.status, input.targetStatus)) throw new Error("FORBIDDEN_TRANSITION");
  const now = new Date();
  await db.collection<StoredGprRegistration>(GPR_REGISTRATIONS_COLLECTION).updateOne(
    { _id: row._id },
    {
      $set: {
        status: input.targetStatus,
        updatedAt: now,
        updatedByUserId: input.actor._id ?? "",
      },
      $push: {
        history: {
          from: row.status,
          to: input.targetStatus,
          byUserId: input.actor._id ?? "",
          at: now,
          comment: input.comment,
        },
      },
    } as unknown as Record<string, unknown>,
  );

  if (input.targetStatus === "SUIVI_CHEF_SERVICE") {
    await ensureGrattageContratIndexes();
    await ensureGrattageContratsFromGpr({
      concessionnaireId: row.concessionnaireId,
      produitsActifs: row.produitsActifs,
      gprRegistrationId: input.registrationId,
      dateDebut: row.dateEnregistrement,
      actor: input.actor,
    });
  }
}

export async function listGprRegistrations(params: {
  page: number;
  pageSize: number;
  status?: GprRegistrationStatus;
  scopeAgenceId?: string;
  scopeAgenceIds?: string[];
  visibility?: Pick<UserDocument, "_id" | "role">;
}) {
  const db = await getDatabase();
  const skip = (params.page - 1) * params.pageSize;
  const filter: Record<string, unknown> = { deletedAt: null };
  if (params.status) filter.status = params.status;
  if (params.scopeAgenceId || (params.scopeAgenceIds && params.scopeAgenceIds.length > 0)) {
    const concessionnaires = await prisma.concessionnaire.findMany({
      where: {
        deletedAt: null,
        ...restrictionToPrismaAgenceWhere({
          agenceId: params.scopeAgenceId,
          agenceIds: params.scopeAgenceIds,
        }),
      },
      select: { id: true },
    });
    filter.concessionnaireId = { $in: concessionnaires.map((row) => row.id) };
  }
  const visibilityFilter = params.visibility
    ? buildWorkflowVisibilityMongoFilter({
        workflow: "GPR",
        role: params.visibility.role,
        userId: params.visibility._id ?? "",
      })
    : null;
  const effectiveFilter: Record<string, unknown> = visibilityFilter
    ? { $and: [filter, visibilityFilter] }
    : filter;
  const col = db.collection<StoredGprRegistration>(GPR_REGISTRATIONS_COLLECTION);
  const [total, rows] = await Promise.all([
    col.countDocuments(effectiveFilter),
    col.find(effectiveFilter).sort({ createdAt: -1 }).skip(skip).limit(params.pageSize).toArray(),
  ]);
  return {
    items: rows.map((r) => ({
      id: r._id.toHexString(),
      reference: r.reference,
      concessionnaireId: r.concessionnaireId,
      produitsActifs: r.produitsActifs,
      dateEnregistrement: r.dateEnregistrement.toISOString(),
      status: r.status,
      sync: {
        state: r.sync.state,
        attempts: r.sync.attempts,
        lastError: r.sync.lastError,
        lastSuccessAt: r.sync.lastSuccessAt ? r.sync.lastSuccessAt.toISOString() : null,
      },
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
    total,
    page: params.page,
    pageSize: params.pageSize,
  };
}

export async function syncGprRegistration(registrationId: string, actor: UserDocument) {
  if (!ObjectId.isValid(registrationId)) throw new Error("GPR_REGISTRATION_NOT_FOUND");
  const { endpoint, apiKey, timeoutMs, maxRetries } = gprSyncConfig();
  if (!endpoint || !apiKey) throw new Error("GPR_SYNC_NOT_CONFIGURED");

  const db = await getDatabase();
  const row = await db.collection<StoredGprRegistration>(GPR_REGISTRATIONS_COLLECTION).findOne({
    _id: new ObjectId(registrationId),
    deletedAt: null,
  });
  if (!row || !(await canAccessGprRegistration(row, actor))) {
    throw new Error("GPR_REGISTRATION_NOT_FOUND");
  }
  if (!["VALIDE_N2", "SUIVI_CHEF_SERVICE"].includes(row.status)) throw new Error("GPR_SYNC_STATUS_NOT_ELIGIBLE");

  const payload = {
    reference: row.reference,
    concessionnaireId: row.concessionnaireId,
    produitsActifs: row.produitsActifs,
    dateEnregistrement: row.dateEnregistrement.toISOString(),
  };

  const now = new Date();
  const attempts = Math.max(0, row.sync.attempts) + 1;
  await db.collection<StoredGprRegistration>(GPR_REGISTRATIONS_COLLECTION).updateOne(
    { _id: row._id },
    {
      $set: {
        "sync.lastAttemptAt": now,
        "sync.attempts": attempts,
        updatedAt: now,
        updatedByUserId: actor._id ?? "",
      },
    },
  );

  let lastError = "UNKNOWN_GPR_SYNC_ERROR";
  for (let tryIndex = 1; tryIndex <= maxRetries; tryIndex += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        lastError = `HTTP_${response.status}${text ? `:${text.slice(0, 180)}` : ""}`;
        continue;
      }
      const body = (await response.json().catch(() => null)) as { id?: string } | null;
      const successAt = new Date();
      await db.collection<StoredGprRegistration>(GPR_REGISTRATIONS_COLLECTION).updateOne(
        { _id: row._id },
        {
          $set: {
            "sync.state": "SUCCESS",
            "sync.lastSuccessAt": successAt,
            "sync.lastError": null,
            "sync.remoteId": body?.id ?? null,
            updatedAt: successAt,
            updatedByUserId: actor._id ?? "",
          },
        },
      );
      await appendAuditLog({
        entityType: "CONCESSIONNAIRE",
        entityId: row.concessionnaireId,
        action: "GPR_SYNC_SUCCESS",
        userId: actor._id ?? "",
        details: { registrationId, reference: row.reference, remoteId: body?.id ?? null },
      });
      return { ok: true as const };
    } catch (error) {
      clearTimeout(timer);
      lastError = error instanceof Error ? error.message : "UNKNOWN_GPR_SYNC_ERROR";
    }
  }

  await db.collection<StoredGprRegistration>(GPR_REGISTRATIONS_COLLECTION).updateOne(
    { _id: row._id },
    {
      $set: {
        "sync.state": "FAILED",
        "sync.lastError": lastError,
        updatedAt: new Date(),
        updatedByUserId: actor._id ?? "",
      },
    },
  );
  await appendAuditLog({
    entityType: "CONCESSIONNAIRE",
    entityId: row.concessionnaireId,
    action: "GPR_SYNC_FAILED",
    userId: actor._id ?? "",
    details: { registrationId, reference: row.reference, error: lastError },
  });
  throw new Error("GPR_SYNC_FAILED");
}

export async function exportGprCsv(actor: UserDocument) {
  const db = await getDatabase();
  const visibility = buildWorkflowVisibilityMongoFilter({
    workflow: "GPR",
    role: actor.role,
    userId: actor._id ?? "",
  });
  const candidates = await db
    .collection<StoredGprRegistration>(GPR_REGISTRATIONS_COLLECTION)
    .find({
      $and: [
        { deletedAt: null, status: { $in: ["VALIDE_N2", "SUIVI_CHEF_SERVICE"] } },
        visibility ?? { _id: { $in: [] } },
      ],
    })
    .sort({ createdAt: -1 })
    .toArray();
  const access = await Promise.all(
    candidates.map(async (row) => ({
      row,
      visible: await canAccessGprRegistration(row, actor),
    })),
  );
  const rows = access.filter((entry) => entry.visible).map((entry) => entry.row);
  const header = ["Reference", "ConcessionnaireId", "Produits", "DateEnregistrement", "Statut"];
  const escapeCell = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = rows.map((r) =>
    [r.reference, r.concessionnaireId, r.produitsActifs.join("|"), r.dateEnregistrement.toISOString(), r.status]
      .map((x) => escapeCell(x))
      .join(","),
  );
  const filename = `gpr-export-${Date.now()}.csv`;
  await db.collection<Omit<StoredGprExportLog, "_id">>(GPR_EXPORT_LOGS_COLLECTION).insertOne({
    exportedAt: new Date(),
    operatorUserId: actor._id ?? "",
    entriesCount: rows.length,
    generatedFilename: filename,
  });
  return {
    filename,
    csv: `\uFEFF${header.map(escapeCell).join(",")}\n${lines.join("\n")}`,
    count: rows.length,
  };
}

export async function listGprExportLogs(actor: Pick<UserDocument, "_id">) {
  const db = await getDatabase();
  const rows = await db
    .collection<StoredGprExportLog>(GPR_EXPORT_LOGS_COLLECTION)
    .find({ operatorUserId: actor._id ?? "" })
    .sort({ exportedAt: -1 })
    .limit(50)
    .toArray();
  return rows.map((r) => ({
    id: r._id.toHexString(),
    exportedAt: r.exportedAt.toISOString(),
    operatorUserId: r.operatorUserId,
    entriesCount: r.entriesCount,
    generatedFilename: r.generatedFilename,
  }));
}

function makeScratchCode() {
  return randomBytes(6).toString("hex").toUpperCase();
}

export async function createScratchLot(input: {
  lotId?: string;
  nombreCodes: number;
  concessionnaireId: string;
  produitCode: string;
  actor: UserDocument;
}) {
  const db = await getDatabase();
  const now = new Date();
  const resolvedLotId = input.lotId?.trim() ? input.lotId.trim().toUpperCase() : await nextScratchLotId();
  const lotDoc: Omit<StoredScratchLot, "_id"> = {
    lotId: resolvedLotId,
    concessionnaireId: input.concessionnaireId,
    produitCode: input.produitCode,
    requestedCount: input.nombreCodes,
    generatedCount: input.nombreCodes,
    status: "GENERE",
    attribueAt: null,
    chefSectionValidatedAt: null,
    activatedAt: null,
    exhaustedAt: null,
    history: [
      {
        action: "LOT_CREATED",
        byUserId: input.actor._id ?? "",
        at: now,
        details: { requestedCount: input.nombreCodes },
      },
    ],
    createdByUserId: input.actor._id ?? "",
    updatedByUserId: input.actor._id ?? "",
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  await db.collection<Omit<StoredScratchLot, "_id">>(SCRATCH_LOTS_COLLECTION).insertOne(lotDoc);
  const codeDocs: Omit<StoredScratchCode, "_id">[] = Array.from({ length: input.nombreCodes }).map(() => ({
    lotId: resolvedLotId,
    code: `${resolvedLotId}-${makeScratchCode()}`,
    concessionnaireId: input.concessionnaireId,
    produitCode: input.produitCode,
    status: "GENERE",
    createdAt: now,
    updatedAt: now,
  }));
  if (codeDocs.length > 0) {
    await db.collection<Omit<StoredScratchCode, "_id">>(SCRATCH_CODES_COLLECTION).insertMany(codeDocs, { ordered: false });
  }
  return { lotId: resolvedLotId, generatedCount: input.nombreCodes };
}

export function canTransitionScratchLot(
  role: LonaciRole,
  from: ScratchCodeStatus,
  to: ScratchCodeStatus,
): boolean {
  if (from === "GENERE" && to === "ATTRIBUE") {
    return ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE", "DISPATCHER"].includes(role);
  }
  if (from === "ATTRIBUE" && to === "ACTIF") return role === "CHEF_SECTION";
  if (from === "ACTIF" && to === "EPUISE") {
    return ["CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"].includes(role);
  }
  return false;
}

export async function transitionScratchLot(input: {
  lotId: string;
  targetStatus: ScratchCodeStatus;
  actor: UserDocument;
}) {
  const db = await getDatabase();
  const lot = await db.collection<StoredScratchLot>(SCRATCH_LOTS_COLLECTION).findOne({ lotId: input.lotId, deletedAt: null });
  if (!lot) throw new Error("LOT_NOT_FOUND");
  if (!canTransitionScratchLot(input.actor.role, lot.status, input.targetStatus)) {
    throw new Error("FORBIDDEN_TRANSITION");
  }
  const now = new Date();
  await db.collection<StoredScratchLot>(SCRATCH_LOTS_COLLECTION).updateOne(
    { _id: lot._id },
    {
      $set: {
        status: input.targetStatus,
        updatedAt: now,
        updatedByUserId: input.actor._id ?? "",
        attribueAt: input.targetStatus === "ATTRIBUE" ? now : lot.attribueAt ?? null,
        chefSectionValidatedAt: input.targetStatus === "ACTIF" ? now : lot.chefSectionValidatedAt,
        activatedAt: input.targetStatus === "ACTIF" ? now : lot.activatedAt,
        exhaustedAt: input.targetStatus === "EPUISE" ? now : lot.exhaustedAt,
      },
      $push: {
        history: {
          action: "STATUS_TRANSITION",
          byUserId: input.actor._id ?? "",
          at: now,
          details: { from: lot.status, to: input.targetStatus },
        },
      },
    } as unknown as Record<string, unknown>,
  );
  await db.collection<StoredScratchCode>(SCRATCH_CODES_COLLECTION).updateMany(
    { lotId: input.lotId },
    { $set: { status: input.targetStatus, updatedAt: now } },
  );
}

function mapScratchLotRow(r: StoredScratchLot) {
  return {
    id: r._id.toHexString(),
    lotId: r.lotId,
    concessionnaireId: r.concessionnaireId,
    produitCode: r.produitCode,
    requestedCount: r.requestedCount,
    generatedCount: r.generatedCount,
    status: r.status,
    attribueAt: r.attribueAt ? r.attribueAt.toISOString() : null,
    activatedAt: r.activatedAt ? r.activatedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    history: r.history.map((h) => ({
      action: h.action,
      byUserId: h.byUserId,
      at: h.at.toISOString(),
      details: h.details,
    })),
  };
}

export async function listScratchLots(params: {
  page: number;
  pageSize: number;
  concessionnaireId?: string;
  produitCode?: string;
  status?: ScratchCodeStatus;
}) {
  const db = await getDatabase();
  const skip = (params.page - 1) * params.pageSize;
  const filter: Record<string, unknown> = { deletedAt: null };
  if (params.concessionnaireId) filter.concessionnaireId = params.concessionnaireId;
  if (params.produitCode) filter.produitCode = params.produitCode.trim().toUpperCase();
  if (params.status) filter.status = params.status;
  const col = db.collection<StoredScratchLot>(SCRATCH_LOTS_COLLECTION);
  const [total, rows] = await Promise.all([
    col.countDocuments(filter),
    col.find(filter).sort({ createdAt: -1 }).skip(skip).limit(params.pageSize).toArray(),
  ]);
  return {
    items: rows.map(mapScratchLotRow),
    total,
    page: params.page,
    pageSize: params.pageSize,
  };
}

export async function listScratchHistoryByConcessionnaire(
  concessionnaireId: string,
  params: { page: number; pageSize: number },
) {
  const lots = await listScratchLots({
    page: params.page,
    pageSize: params.pageSize,
    concessionnaireId,
  });
  const db = await getDatabase();
  const codeCounts = await db
    .collection<StoredScratchCode>(SCRATCH_CODES_COLLECTION)
    .aggregate<{ _id: ScratchCodeStatus; count: number }>([
      { $match: { concessionnaireId } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ])
    .toArray();
  const codesByStatus = Object.fromEntries(codeCounts.map((c) => [c._id, c.count])) as Record<
    ScratchCodeStatus,
    number
  >;
  return { ...lots, codesByStatus, concessionnaireId };
}

export async function listEligibleConcessionnairesForProduct(input: {
  produitCode: string;
  agenceId?: string;
  agenceIds?: string[];
  q?: string;
  limit?: number;
}) {
  const produitCode = input.produitCode.trim().toUpperCase();
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 200);
  const q = input.q?.trim().toLowerCase();

  const agenceWhere =
    input.agenceIds && input.agenceIds.length > 0
      ? { agenceId: { in: input.agenceIds } }
      : input.agenceId
        ? { agenceId: input.agenceId }
        : {};

  const pdvs = await prisma.concessionnaire.findMany({
    where: {
      deletedAt: null,
      statut: "ACTIF",
      inscriptionStatut: "VALIDE",
      ...agenceWhere,
    },
    select: {
      id: true,
      codePdv: true,
      raisonSociale: true,
      agenceId: true,
    },
    take: 500,
    orderBy: { raisonSociale: "asc" },
  });

  const ids = pdvs.map((p) => p.id);
  if (ids.length === 0) return [];

  const db = await getDatabase();
  const [contrats, gprRows] = await Promise.all([
    prisma.contrat.findMany({
      where: {
        concessionnaireId: { in: ids },
        produitCode,
        status: "ACTIF",
        deletedAt: null,
      },
      select: { concessionnaireId: true },
    }),
    db
      .collection<StoredGprRegistration>(GPR_REGISTRATIONS_COLLECTION)
      .find({
        concessionnaireId: { $in: ids },
        deletedAt: null,
        status: { $in: GPR_ELIGIBLE_STATUSES },
        produitsActifs: produitCode,
      })
      .project({ concessionnaireId: 1 })
      .toArray(),
  ]);

  const withContrat = new Set(contrats.map((c) => c.concessionnaireId));
  const gprOk = new Set(gprRows.map((r) => r.concessionnaireId));

  return pdvs
    .filter((p) => withContrat.has(p.id) && gprOk.has(p.id))
    .filter((p) => {
      if (!q) return true;
      const hay = `${p.codePdv} ${p.raisonSociale}`.toLowerCase();
      return hay.includes(q);
    })
    .slice(0, limit)
    .map((p) => ({
      id: p.id,
      codePdv: p.codePdv,
      raisonSociale: p.raisonSociale,
      agenceId: p.agenceId,
      produitCode,
    }));
}

export async function getScratchDispatcherDashboard(alertThreshold?: number) {
  const envSeuil = Number.parseInt(process.env.GRATTAGE_STOCK_ALERT_THRESHOLD?.trim() ?? "", 10);
  const seuil =
    alertThreshold ?? (Number.isFinite(envSeuil) && envSeuil > 0 ? envSeuil : GRATTAGE_STOCK_ALERT_DEFAULT);

  const db = await getDatabase();
  const lots = await db
    .collection<StoredScratchLot>(SCRATCH_LOTS_COLLECTION)
    .find({ deletedAt: null })
    .toArray();

  let codesDistribues = 0;
  let soldeRestant = 0;
  const byProduit = new Map<string, { solde: number; distribues: number }>();

  for (const lot of lots) {
    const bucket = byProduit.get(lot.produitCode) ?? { solde: 0, distribues: 0 };
    if (lot.status === "GENERE") {
      soldeRestant += lot.generatedCount;
      bucket.solde += lot.generatedCount;
    }
    if (SCRATCH_DISTRIBUTED_STATUSES.includes(lot.status)) {
      codesDistribues += lot.generatedCount;
      bucket.distribues += lot.generatedCount;
    }
    byProduit.set(lot.produitCode, bucket);
  }

  const alertesRupture = [...byProduit.entries()]
    .filter(([, v]) => v.solde < seuil)
    .map(([produitCode, v]) => ({
      produitCode,
      soldeRestant: v.solde,
      codesDistribues: v.distribues,
      seuil,
    }))
    .sort((a, b) => a.soldeRestant - b.soldeRestant);

  return {
    codesDistribues,
    soldeRestant,
    lotsTotal: lots.length,
    lotsEnAttenteAttribution: lots.filter((l) => l.status === "GENERE").length,
    lotsActifs: lots.filter((l) => l.status === "ACTIF").length,
    alertesRupture,
    seuilAlerte: seuil,
    generatedAt: new Date().toISOString(),
  };
}

export async function exportScratchLotCodes(lotId: string) {
  const db = await getDatabase();
  const codes = await db.collection<StoredScratchCode>(SCRATCH_CODES_COLLECTION).find({ lotId }).sort({ createdAt: 1 }).toArray();
  const header = ["LotId", "Code", "ConcessionnaireId", "ProduitCode", "Statut"];
  const escapeCell = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = codes.map((c) =>
    [c.lotId, c.code, c.concessionnaireId, c.produitCode, c.status].map((x) => escapeCell(x)).join(","),
  );
  return {
    filename: `codes-grattage-${lotId}-${Date.now()}.csv`,
    csv: `\uFEFF${header.map(escapeCell).join(",")}\n${lines.join("\n")}`,
  };
}
