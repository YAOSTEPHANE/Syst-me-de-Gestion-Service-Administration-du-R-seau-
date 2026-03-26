import { ObjectId } from "mongodb";

import type { CautionStatus } from "@/lib/lonaci/constants";
import type {
  CautionDocument,
  CautionPaymentMode,
  ContratDocument,
  PdvIntegrationDocument,
  UserDocument,
} from "@/lib/lonaci/types";
import { getResolvedAlertThresholds } from "@/lib/lonaci/alert-thresholds";
import { appendAuditLog } from "@/lib/lonaci/audit";
import { broadcastCriticalEmailToRole } from "@/lib/lonaci/critical-email";
import { findConcessionnaireById, updateConcessionnaire } from "@/lib/lonaci/concessionnaires";
import { isStatutBloquant } from "@/lib/lonaci/access";
import { getDatabase } from "@/lib/mongodb";
import { prisma } from "@/lib/prisma";

const CAUTIONS_COLLECTION = "cautions";
const PDV_INTEGRATIONS_COLLECTION = "pdv_integrations";
const CONTRATS_COLLECTION = "contrats";
const COUNTERS_COLLECTION = "counters";
const PDV_INTEGRATION_COUNTER_ID = "pdv_integration_ref";

type StoredContrat = Omit<ContratDocument, "_id"> & { _id: ObjectId };
type StoredCaution = Omit<CautionDocument, "_id"> & { _id: ObjectId };
type InsertCaution = Omit<StoredCaution, "_id">;
type StoredPdvIntegration = Omit<PdvIntegrationDocument, "_id"> & { _id: ObjectId };
type InsertPdvIntegration = Omit<StoredPdvIntegration, "_id">;

export async function ensureSprint4Indexes() {
  const db = await getDatabase();
  await db.collection<StoredCaution>(CAUTIONS_COLLECTION).createIndexes([
    { key: { contratId: 1 }, unique: true, name: "uniq_contrat" },
    { key: { status: 1, dueDate: 1 }, name: "idx_status_dueDate" },
  ]);
  await db.collection<StoredPdvIntegration>(PDV_INTEGRATIONS_COLLECTION).createIndexes([
    { key: { reference: 1 }, unique: true, name: "uniq_reference" },
    { key: { codePdv: 1 }, name: "idx_codePdv" },
    { key: { status: 1 }, name: "idx_status" },
  ]);
  await db.collection<StoredContrat>(CONTRATS_COLLECTION).createIndexes([
    { key: { status: 1, concessionnaireId: 1 }, name: "idx_status_concessionnaire" },
  ]);
}

async function findContratById(id: string): Promise<ContratDocument | null> {
  if (!ObjectId.isValid(id)) return null;
  const db = await getDatabase();
  const row = await db.collection<StoredContrat>(CONTRATS_COLLECTION).findOne({
    _id: new ObjectId(id),
    deletedAt: null,
  });
  if (!row) return null;
  return { ...row, _id: row._id.toHexString() };
}

export async function createCaution(input: {
  contratId: string;
  montant: number;
  modeReglement: CautionPaymentMode;
  dueDate: Date;
  paymentReference: string;
  observations: string | null;
  actor: UserDocument;
}) {
  const contrat = await findContratById(input.contratId);
  if (!contrat) throw new Error("CONTRAT_NOT_FOUND");
  if (contrat.status !== "ACTIF") throw new Error("CONTRAT_NOT_ACTIF");

  const concessionnaire = await findConcessionnaireById(contrat.concessionnaireId);
  if (!concessionnaire || concessionnaire.deletedAt) throw new Error("CONCESSIONNAIRE_NOT_FOUND");
  if (isStatutBloquant(concessionnaire.statut)) throw new Error("CONCESSIONNAIRE_BLOQUE");

  const db = await getDatabase();
  const now = new Date();
  const autoValidate = input.actor.role === "CHEF_SERVICE";
  const doc: InsertCaution = {
    contratId: input.contratId,
    montant: input.montant,
    modeReglement: input.modeReglement,
    status: autoValidate ? "PAYEE" : "EN_ATTENTE",
    dueDate: input.dueDate,
    paymentReference: input.paymentReference,
    observations: input.observations,
    paidAt: autoValidate ? now : null,
    immutableAfterFinal: autoValidate,
    createdByUserId: input.actor._id ?? "",
    updatedByUserId: input.actor._id ?? "",
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  const result = await db.collection<InsertCaution>(CAUTIONS_COLLECTION).insertOne(doc);
  await appendAuditLog({
    entityType: "CONTRAT",
    entityId: input.contratId,
    action: "CAUTION_CREATE",
    userId: input.actor._id ?? "",
    details: {
      cautionId: result.insertedId.toHexString(),
      montant: input.montant,
      status: doc.status,
      autoValidated: autoValidate,
    },
  });
  return { ...doc, _id: result.insertedId.toHexString() };
}

export async function finalizeCaution(cautionId: string, paid: boolean, actor: UserDocument) {
  if (!ObjectId.isValid(cautionId)) throw new Error("CAUTION_NOT_FOUND");
  const db = await getDatabase();
  const caution = await db.collection<StoredCaution>(CAUTIONS_COLLECTION).findOne({
    _id: new ObjectId(cautionId),
    deletedAt: null,
  });
  if (!caution) throw new Error("CAUTION_NOT_FOUND");
  if (caution.immutableAfterFinal) throw new Error("CAUTION_IMMUTABLE");
  const status = paid ? "PAYEE" : "ANNULEE";
  const now = new Date();
  await db.collection<StoredCaution>(CAUTIONS_COLLECTION).updateOne(
    { _id: new ObjectId(cautionId) },
    {
      $set: {
        status,
        paidAt: paid ? now : null,
        immutableAfterFinal: true,
        updatedAt: now,
        updatedByUserId: actor._id ?? "",
      },
    },
  );
  await appendAuditLog({
    entityType: "CONTRAT",
    entityId: caution.contratId,
    action: "CAUTION_FINALIZE",
    userId: actor._id ?? "",
    details: { cautionId, status },
  });
}

export async function returnCautionForCorrection(input: {
  cautionId: string;
  comment: string;
  actor: UserDocument;
}) {
  if (!ObjectId.isValid(input.cautionId)) throw new Error("CAUTION_NOT_FOUND");
  const db = await getDatabase();
  const caution = await db.collection<StoredCaution>(CAUTIONS_COLLECTION).findOne({
    _id: new ObjectId(input.cautionId),
    deletedAt: null,
  });
  if (!caution) throw new Error("CAUTION_NOT_FOUND");
  if (caution.immutableAfterFinal) throw new Error("CAUTION_IMMUTABLE");
  const now = new Date();
  await db.collection<StoredCaution>(CAUTIONS_COLLECTION).updateOne(
    { _id: new ObjectId(input.cautionId) },
    {
      $set: {
        status: "A_CORRIGER",
        updatedAt: now,
        updatedByUserId: input.actor._id ?? "",
      },
      $push: {
        history: {
          $each: [
            {
              action: "RETOUR_CORRECTION",
              comment: input.comment,
              actedAt: now,
              actedByUserId: input.actor._id ?? "",
            },
          ],
        },
      },
    } as unknown as Record<string, unknown>,
  );
  await appendAuditLog({
    entityType: "CONTRAT",
    entityId: caution.contratId,
    action: "CAUTION_RETURN_FOR_CORRECTION",
    userId: input.actor._id ?? "",
    details: { cautionId: input.cautionId, comment: input.comment },
  });
}

export async function listCautionAlertsJ10() {
  const thr = await getResolvedAlertThresholds();
  const db = await getDatabase();
  const today = new Date();
  const threshold = new Date(today);
  threshold.setDate(today.getDate() - thr.cautionOverdueDays);
  const rows = await db.collection<StoredCaution>(CAUTIONS_COLLECTION).find({
    status: "EN_ATTENTE",
    dueDate: { $lte: threshold },
    deletedAt: null,
  }).toArray();
  return rows.map((row) => ({
    id: row._id.toHexString(),
    contratId: row.contratId,
    montant: row.montant,
    dueDate: row.dueDate.toISOString(),
    daysOverdue: Math.floor((today.getTime() - row.dueDate.getTime()) / (1000 * 60 * 60 * 24)),
  }));
}

async function nextPdvIntegrationReference() {
  const db = await getDatabase();
  await db.collection<{ _id: string; seq: number }>(COUNTERS_COLLECTION).updateOne(
    { _id: PDV_INTEGRATION_COUNTER_ID },
    { $inc: { seq: 1 } },
    { upsert: true },
  );
  const counter = await db.collection<{ _id: string; seq: number }>(COUNTERS_COLLECTION).findOne({
    _id: PDV_INTEGRATION_COUNTER_ID,
  });
  const seq = counter?.seq ?? 1;
  return `PDVI-${String(seq).padStart(7, "0")}`;
}

export async function createPdvIntegration(input: {
  agenceId: string | null;
  produitCode: string;
  nombreDemandes: number;
  dateDemande: Date;
  gps: { lat: number; lng: number };
  observations: string | null;
  actor: UserDocument;
}) {
  const db = await getDatabase();
  const now = new Date();
  const ref = await nextPdvIntegrationReference();
  const generatedCodePdv = `PDV-${input.produitCode.trim().toUpperCase()}-${ref.slice(-4)}`;
  const generatedRaisonSociale = `Demande intégration ${input.produitCode.trim().toUpperCase()}`;
  const doc: InsertPdvIntegration = {
    reference: ref,
    codePdv: generatedCodePdv,
    concessionnaireId: null,
    raisonSociale: generatedRaisonSociale,
    agenceId: input.agenceId,
    produitCode: input.produitCode.trim().toUpperCase(),
    nombreDemandes: input.nombreDemandes,
    dateDemande: input.dateDemande,
    gps: input.gps,
    observations: input.observations,
    status: "DEMANDE_RECUE",
    finalizedAt: null,
    createdByUserId: input.actor._id ?? "",
    updatedByUserId: input.actor._id ?? "",
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  const result = await db.collection<InsertPdvIntegration>(PDV_INTEGRATIONS_COLLECTION).insertOne(doc);
  return { ...doc, _id: result.insertedId.toHexString() };
}

export async function finalizePdvIntegration(integrationId: string, actor: UserDocument) {
  if (!ObjectId.isValid(integrationId)) throw new Error("PDV_INTEGRATION_NOT_FOUND");
  const db = await getDatabase();
  const row = await db.collection<StoredPdvIntegration>(PDV_INTEGRATIONS_COLLECTION).findOne({
    _id: new ObjectId(integrationId),
    deletedAt: null,
  });
  if (!row) throw new Error("PDV_INTEGRATION_NOT_FOUND");
  if (!row.gps) throw new Error("GPS_REQUIRED");
  if (row.status !== "INTEGRE_GPR") throw new Error("INVALID_PDV_STATUS_TRANSITION");

  let concessionnaireId = row.concessionnaireId;
  if (!concessionnaireId) {
    const now = new Date();
    const created = await db.collection("concessionnaires").insertOne({
      codePdv: row.codePdv,
      raisonSociale: row.raisonSociale,
      email: null,
      telephone: null,
      adresse: null,
      ville: null,
      codePostal: null,
      agenceId: row.agenceId,
      statut: "ACTIF",
      gps: row.gps,
      piecesJointes: [],
      notesInternes: "Auto-cree depuis integration PDV finalisee",
      createdByUserId: actor._id ?? "",
      updatedByUserId: actor._id ?? "",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
    concessionnaireId = created.insertedId.toHexString();
  }

  const now = new Date();
  await db.collection<StoredPdvIntegration>(PDV_INTEGRATIONS_COLLECTION).updateOne(
    { _id: new ObjectId(integrationId) },
    {
      $set: {
        concessionnaireId,
        status: "FINALISE",
        finalizedAt: now,
        updatedAt: now,
        updatedByUserId: actor._id ?? "",
      },
    },
  );
  await appendAuditLog({
    entityType: "CONCESSIONNAIRE",
    entityId: concessionnaireId,
    action: "PDV_INTEGRATION_FINALIZE",
    userId: actor._id ?? "",
    details: { integrationId },
  });
  return { concessionnaireId };
}

export async function transitionPdvIntegration(input: {
  integrationId: string;
  targetStatus: "EN_TRAITEMENT" | "INTEGRE_GPR" | "FINALISE";
  actor: UserDocument;
}) {
  if (!ObjectId.isValid(input.integrationId)) throw new Error("PDV_INTEGRATION_NOT_FOUND");
  const db = await getDatabase();
  const row = await db.collection<StoredPdvIntegration>(PDV_INTEGRATIONS_COLLECTION).findOne({
    _id: new ObjectId(input.integrationId),
    deletedAt: null,
  });
  if (!row) throw new Error("PDV_INTEGRATION_NOT_FOUND");

  // Compat rétro: certains anciens documents utilisaient EN_COURS.
  const rawStatus = row.status as string;
  const current: PdvIntegrationDocument["status"] = rawStatus === "EN_COURS" ? "EN_TRAITEMENT" : row.status;
  const next = input.targetStatus;
  const role = input.actor.role;

  if (current === "DEMANDE_RECUE" && next === "EN_TRAITEMENT") {
    if (!["CHEF_SECTION", "CHEF_SERVICE"].includes(role)) throw new Error("FORBIDDEN_TRANSITION");
  } else if (current === "EN_TRAITEMENT" && next === "INTEGRE_GPR") {
    if (!["CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"].includes(role)) throw new Error("FORBIDDEN_TRANSITION");
  } else if (current === "INTEGRE_GPR" && next === "FINALISE") {
    if (role !== "CHEF_SERVICE") throw new Error("FORBIDDEN_TRANSITION");
    return finalizePdvIntegration(input.integrationId, input.actor);
  } else {
    throw new Error("INVALID_PDV_STATUS_TRANSITION");
  }

  const now = new Date();
  await db.collection<StoredPdvIntegration>(PDV_INTEGRATIONS_COLLECTION).updateOne(
    { _id: new ObjectId(input.integrationId) },
    {
      $set: {
        status: next,
        updatedAt: now,
        updatedByUserId: input.actor._id ?? "",
      },
    },
  );

  await appendAuditLog({
    entityType: "CONCESSIONNAIRE",
    entityId: row.concessionnaireId ?? row.codePdv,
    action: "PDV_INTEGRATION_STATUS_TRANSITION",
    userId: input.actor._id ?? "",
    details: { integrationId: input.integrationId, from: current, to: next },
  });
  return { ok: true };
}

export async function listPdvIntegrations(input: {
  page: number;
  pageSize: number;
  agenceId?: string;
  produitCode?: string;
  status?: "DEMANDE_RECUE" | "EN_TRAITEMENT" | "INTEGRE_GPR" | "FINALISE";
  dateFrom?: Date;
  dateTo?: Date;
}) {
  const db = await getDatabase();
  const skip = (input.page - 1) * input.pageSize;
  const col = db.collection<StoredPdvIntegration>(PDV_INTEGRATIONS_COLLECTION);
  const filter: Record<string, unknown> = { deletedAt: null };
  if (input.agenceId) filter.agenceId = input.agenceId;
  if (input.produitCode) filter.produitCode = input.produitCode.toUpperCase();
  if (input.status) filter.status = input.status;
  if (input.dateFrom || input.dateTo) {
    const range: Record<string, Date> = {};
    if (input.dateFrom) range.$gte = input.dateFrom;
    if (input.dateTo) range.$lte = input.dateTo;
    filter.dateDemande = range;
  }

  const now = new Date();
  const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);

  const [total, rows] = await Promise.all([
    col.countDocuments(filter),
    col.find(filter).sort({ dateDemande: -1, createdAt: -1 }).skip(skip).limit(input.pageSize).toArray(),
  ]);
  const countersByAgenceRows = await col
    .aggregate<{ _id: string | null; count: number }>([
      { $match: { ...filter, status: "EN_TRAITEMENT" } },
      { $group: { _id: "$agenceId", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ])
    .toArray();
  const staleProcessingCount = await col.countDocuments({
    ...filter,
    status: "EN_TRAITEMENT",
    updatedAt: { $lt: fiveDaysAgo },
  });

  return {
    items: rows.map((row) => ({
      id: row._id.toHexString(),
      reference: row.reference,
      codePdv: row.codePdv,
      concessionnaireId: row.concessionnaireId,
      raisonSociale: row.raisonSociale,
      agenceId: row.agenceId,
      produitCode: row.produitCode ?? "",
      nombreDemandes: row.nombreDemandes ?? 0,
      // Compat rétro: certains anciens documents n'ont pas `dateDemande`.
      dateDemande: (row.dateDemande ?? row.createdAt).toISOString(),
      gps: row.gps,
      observations: row.observations ?? null,
      status: ((row.status as string) === "EN_COURS" ? "EN_TRAITEMENT" : row.status),
      finalizedAt: row.finalizedAt ? row.finalizedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
    dashboard: {
      byAgenceEnTraitement: countersByAgenceRows.map((r) => ({ agenceId: r._id, count: r.count })),
      staleProcessingCount,
    },
    total,
    page: input.page,
    pageSize: input.pageSize,
  };
}

export async function resiliateConcessionnaire(input: {
  concessionnaireId: string;
  reason: string;
  confirm: boolean;
  actor: UserDocument;
}) {
  if (!input.confirm) throw new Error("CONFIRM_REQUIRED");
  const concessionnaire = await findConcessionnaireById(input.concessionnaireId);
  if (!concessionnaire || concessionnaire.deletedAt) throw new Error("CONCESSIONNAIRE_NOT_FOUND");
  if (concessionnaire.statut === "RESILIE") throw new Error("ALREADY_RESILIE");

  const updated = await updateConcessionnaire(
    input.concessionnaireId,
    { statut: "RESILIE", notesInternes: `RESILIATION: ${input.reason}` },
    input.actor,
  );
  if (!updated) throw new Error("CONCESSIONNAIRE_NOT_FOUND");

  const db = await getDatabase();
  await db.collection<StoredContrat>(CONTRATS_COLLECTION).updateMany(
    { concessionnaireId: input.concessionnaireId, status: "ACTIF", deletedAt: null },
    {
      $set: {
        status: "RESILIE",
        updatedAt: new Date(),
        updatedByUserId: input.actor._id ?? "",
      },
    },
  );

  await appendAuditLog({
    entityType: "CONCESSIONNAIRE",
    entityId: input.concessionnaireId,
    action: "RESILIATION",
    userId: input.actor._id ?? "",
    details: { reason: input.reason },
  });

  await broadcastCriticalEmailToRole(
    "ASSIST_CDS",
    `Resiliation concessionnaire ${concessionnaire.codePdv}`,
    `Une resiliation a ete enregistree. Motif: ${input.reason}`,
  );
}

export const CAUTION_LIST_TABS = ["J10_OVERDUE", "EN_ATTENTE", "VALIDATED_THIS_MONTH"] as const;
export type CautionListTab = (typeof CAUTION_LIST_TABS)[number];

export interface CautionListRowDto {
  id: string;
  contratId: string;
  montant: number;
  modeReglement: CautionPaymentMode;
  status: CautionStatus;
  paymentReference: string;
  observations: string | null;
  dueDate: string;
  paidAt: string | null;
  daysOverdue: number;
  immutableAfterFinal: boolean;
  pdvCode: string;
  depotAt: string | null;
}

function cautionDueThresholdDate(): Promise<Date> {
  return getResolvedAlertThresholds().then((thr) => {
    const today = new Date();
    const threshold = new Date(today);
    threshold.setDate(today.getDate() - thr.cautionOverdueDays);
    return threshold;
  });
}

/** Compteurs des trois tuiles de l’écran Cautions (cohérents avec les onglets liste). */
export async function getCautionCounters(): Promise<{
  overdueJ10: number;
  enAttente: number;
  validatedThisMonth: number;
}> {
  const db = await getDatabase();
  const threshold = await cautionDueThresholdDate();
  const today = new Date();
  const startMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const startNext = new Date(today.getFullYear(), today.getMonth() + 1, 1);

  const base = { deletedAt: null };

  const [overdueJ10, enAttente, validatedThisMonth] = await Promise.all([
    db.collection(CAUTIONS_COLLECTION).countDocuments({
      ...base,
      status: { $in: ["EN_ATTENTE", "A_CORRIGER"] },
      dueDate: { $lte: threshold },
    }),
    db.collection(CAUTIONS_COLLECTION).countDocuments({
      ...base,
      status: { $in: ["EN_ATTENTE", "A_CORRIGER"] },
      dueDate: { $gt: threshold },
    }),
    db.collection(CAUTIONS_COLLECTION).countDocuments({
      ...base,
      status: "PAYEE",
      paidAt: { $gte: startMonth, $lt: startNext },
    }),
  ]);

  return { overdueJ10, enAttente, validatedThisMonth };
}

async function mapCautionsToListRows(rows: StoredCaution[]): Promise<CautionListRowDto[]> {
  const today = new Date();
  const contratIds = [...new Set(rows.map((r) => r.contratId))];
  let pdvByContratId = new Map<string, string>();
  if (contratIds.length > 0) {
    const contrats = await prisma.contrat.findMany({
      where: { id: { in: contratIds }, deletedAt: null },
      select: { id: true, concessionnaireId: true },
    });
    const pdvIds = [...new Set(contrats.map((c) => c.concessionnaireId))];
    const pdvs =
      pdvIds.length === 0
        ? []
        : await prisma.concessionnaire.findMany({
            where: { id: { in: pdvIds }, deletedAt: null },
            select: { id: true, codePdv: true },
          });
    const pdvMap = new Map(pdvs.map((p) => [p.id, p.codePdv]));
    pdvByContratId = new Map(
      contrats.map((c) => [c.id, pdvMap.get(c.concessionnaireId) ?? ""]),
    );
  }

  return rows.map((row) => ({
    id: row._id.toHexString(),
    contratId: row.contratId,
    montant: row.montant,
    modeReglement: row.modeReglement,
    status: row.status,
    paymentReference: row.paymentReference,
    observations: row.observations,
    dueDate: row.dueDate.toISOString(),
    paidAt: row.paidAt ? row.paidAt.toISOString() : null,
    daysOverdue: Math.floor((today.getTime() - row.dueDate.getTime()) / (1000 * 60 * 60 * 24)),
    immutableAfterFinal: row.immutableAfterFinal,
    pdvCode: pdvByContratId.get(row.contratId) ?? "—",
    depotAt: row.createdAt.toISOString(),
  }));
}

export async function listCautionsForTab(
  tab: CautionListTab,
  page: number,
  pageSize: number,
): Promise<{ items: CautionListRowDto[]; total: number }> {
  const db = await getDatabase();
  const threshold = await cautionDueThresholdDate();
  const today = new Date();
  const startMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const startNext = new Date(today.getFullYear(), today.getMonth() + 1, 1);

  const base = { deletedAt: null };
  let filter: Record<string, unknown> = base;

  if (tab === "J10_OVERDUE") {
    filter = { ...base, status: { $in: ["EN_ATTENTE", "A_CORRIGER"] }, dueDate: { $lte: threshold } };
  } else if (tab === "EN_ATTENTE") {
    filter = { ...base, status: { $in: ["EN_ATTENTE", "A_CORRIGER"] }, dueDate: { $gt: threshold } };
  } else {
    filter = {
      ...base,
      status: "PAYEE",
      paidAt: { $gte: startMonth, $lt: startNext },
    };
  }

  const col = db.collection<StoredCaution>(CAUTIONS_COLLECTION);
  const skip = Math.max(0, (page - 1) * pageSize);

  const [total, rows] = await Promise.all([
    col.countDocuments(filter),
    (tab === "VALIDATED_THIS_MONTH"
      ? col.find(filter).sort({ paidAt: -1 })
      : col.find(filter).sort({ dueDate: 1 })
    )
      .skip(skip)
      .limit(pageSize)
      .toArray(),
  ]);

  const items = await mapCautionsToListRows(rows);
  return { items, total };
}
