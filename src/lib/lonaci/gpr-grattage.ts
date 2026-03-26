import { randomBytes } from "crypto";

import { ObjectId } from "mongodb";

import type { LonaciRole } from "@/lib/lonaci/constants";
import type { UserDocument } from "@/lib/lonaci/types";
import { appendAuditLog } from "@/lib/lonaci/audit";
import { getDatabase } from "@/lib/mongodb";

const GPR_REGISTRATIONS_COLLECTION = "gpr_registrations";
const GPR_EXPORT_LOGS_COLLECTION = "gpr_export_logs";
const SCRATCH_LOTS_COLLECTION = "scratch_code_lots";
const SCRATCH_CODES_COLLECTION = "scratch_codes";
const COUNTERS_COLLECTION = "counters";
const GPR_COUNTER_ID = "gpr_registration_ref";

export const GPR_REGISTRATION_STATUSES = [
  "SOUMIS_AGENT",
  "VALIDE_N1",
  "VALIDE_N2",
  "SUIVI_CHEF_SERVICE",
  "REJETE",
] as const;
export type GprRegistrationStatus = (typeof GPR_REGISTRATION_STATUSES)[number];

export const SCRATCH_CODE_STATUSES = ["GENERE", "ATTRIBUE", "ACTIF", "EPUISE"] as const;
export type ScratchCodeStatus = (typeof SCRATCH_CODE_STATUSES)[number];

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
  if (to === "REJETE") return ["CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"].includes(role);
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
}

export async function listGprRegistrations(params: { page: number; pageSize: number; status?: GprRegistrationStatus }) {
  const db = await getDatabase();
  const skip = (params.page - 1) * params.pageSize;
  const filter: Record<string, unknown> = { deletedAt: null };
  if (params.status) filter.status = params.status;
  const col = db.collection<StoredGprRegistration>(GPR_REGISTRATIONS_COLLECTION);
  const [total, rows] = await Promise.all([
    col.countDocuments(filter),
    col.find(filter).sort({ createdAt: -1 }).skip(skip).limit(params.pageSize).toArray(),
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
  if (!row) throw new Error("GPR_REGISTRATION_NOT_FOUND");
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
  const rows = await db
    .collection<StoredGprRegistration>(GPR_REGISTRATIONS_COLLECTION)
    .find({ deletedAt: null, status: { $in: ["VALIDE_N2", "SUIVI_CHEF_SERVICE"] } })
    .sort({ createdAt: -1 })
    .toArray();
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

export async function listGprExportLogs() {
  const db = await getDatabase();
  const rows = await db
    .collection<StoredGprExportLog>(GPR_EXPORT_LOGS_COLLECTION)
    .find({})
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
  lotId: string;
  nombreCodes: number;
  concessionnaireId: string;
  produitCode: string;
  actor: UserDocument;
}) {
  const db = await getDatabase();
  const now = new Date();
  const lotDoc: Omit<StoredScratchLot, "_id"> = {
    lotId: input.lotId,
    concessionnaireId: input.concessionnaireId,
    produitCode: input.produitCode,
    requestedCount: input.nombreCodes,
    generatedCount: input.nombreCodes,
    status: "GENERE",
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
    lotId: input.lotId,
    code: `${input.lotId}-${makeScratchCode()}`,
    concessionnaireId: input.concessionnaireId,
    produitCode: input.produitCode,
    status: "GENERE",
    createdAt: now,
    updatedAt: now,
  }));
  if (codeDocs.length > 0) {
    await db.collection<Omit<StoredScratchCode, "_id">>(SCRATCH_CODES_COLLECTION).insertMany(codeDocs, { ordered: false });
  }
}

function canTransitionLot(role: LonaciRole, from: ScratchCodeStatus, to: ScratchCodeStatus) {
  if (from === "GENERE" && to === "ATTRIBUE") return true;
  if (from === "ATTRIBUE" && to === "ACTIF") return role === "CHEF_SECTION";
  if (from === "ACTIF" && to === "EPUISE") return ["CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"].includes(role);
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
  if (!canTransitionLot(input.actor.role, lot.status, input.targetStatus)) throw new Error("FORBIDDEN_TRANSITION");
  const now = new Date();
  await db.collection<StoredScratchLot>(SCRATCH_LOTS_COLLECTION).updateOne(
    { _id: lot._id },
    {
      $set: {
        status: input.targetStatus,
        updatedAt: now,
        updatedByUserId: input.actor._id ?? "",
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

export async function listScratchLots(params: { page: number; pageSize: number }) {
  const db = await getDatabase();
  const skip = (params.page - 1) * params.pageSize;
  const col = db.collection<StoredScratchLot>(SCRATCH_LOTS_COLLECTION);
  const [total, rows] = await Promise.all([
    col.countDocuments({ deletedAt: null }),
    col.find({ deletedAt: null }).sort({ createdAt: -1 }).skip(skip).limit(params.pageSize).toArray(),
  ]);
  return {
    items: rows.map((r) => ({
      id: r._id.toHexString(),
      lotId: r.lotId,
      concessionnaireId: r.concessionnaireId,
      produitCode: r.produitCode,
      requestedCount: r.requestedCount,
      generatedCount: r.generatedCount,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      history: r.history.map((h) => ({
        action: h.action,
        byUserId: h.byUserId,
        at: h.at.toISOString(),
        details: h.details,
      })),
    })),
    total,
    page: params.page,
    pageSize: params.pageSize,
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
