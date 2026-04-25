import { ObjectId } from "mongodb";

import type { CautionStatus } from "@/lib/lonaci/constants";
import type {
  CautionDocument,
  CautionPaymentMode,
  ContratDocument,
  PdvIntegrationDocument,
  UserDocument,
} from "@/lib/lonaci/types";
import { userDisplayName } from "@/lib/lonaci/types";
import { getResolvedAlertThresholds } from "@/lib/lonaci/alert-thresholds";
import { appendAuditLog } from "@/lib/lonaci/audit";
import { broadcastCriticalEmailToRole } from "@/lib/lonaci/critical-email";
import { findConcessionnaireById, updateConcessionnaire } from "@/lib/lonaci/concessionnaires";
import { isStatutBloquant } from "@/lib/lonaci/access";
import { notifyRoleTargets } from "@/lib/lonaci/notifications";
import { listContratsAllMatching, type ListContratsParams } from "@/lib/lonaci/contracts";
import { listProduits } from "@/lib/lonaci/referentials";
import { formatAgenceLibelle, listAgenceIdsZoneAbidjan, loadAgenceLibelleMap } from "@/lib/lonaci/zones-abidjan";
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
  const actionBy = userDisplayName(input.actor);
  const contrat = await findContratById(input.contratId);
  if (!contrat) throw new Error("CONTRAT_NOT_FOUND");
  if (contrat.status !== "ACTIF") throw new Error("CONTRAT_NOT_ACTIF");

  const concessionnaire = await findConcessionnaireById(contrat.concessionnaireId);
  if (!concessionnaire || concessionnaire.deletedAt) throw new Error("CONCESSIONNAIRE_NOT_FOUND");
  if (isStatutBloquant(concessionnaire.statut)) throw new Error("CONCESSIONNAIRE_BLOQUE");

  const db = await getDatabase();
  const now = new Date();
  const doc: InsertCaution = {
    contratId: input.contratId,
    montant: input.montant,
    modeReglement: input.modeReglement,
    status: "EN_ATTENTE",
    dueDate: input.dueDate,
    paymentReference: input.paymentReference,
    observations: input.observations,
    paidAt: null,
    immutableAfterFinal: false,
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
      autoValidated: false,
    },
  });
  await notifyRoleTargets(
    "CHEF_SECTION",
    "Nouvelle caution enregistree",
    `Opération caution | référence ${result.insertedId.toHexString()} | action validation N1 attendue | contrat ${input.contratId} | acteur ${actionBy}.`,
    {
      cautionId: result.insertedId.toHexString(),
      contratId: input.contratId,
      status: doc.status,
      montant: input.montant,
    },
  );
  return { ...doc, _id: result.insertedId.toHexString() };
}

export async function validateCautionN1(cautionId: string, actor: UserDocument) {
  if (!ObjectId.isValid(cautionId)) throw new Error("CAUTION_NOT_FOUND");
  if (actor.role !== "CHEF_SECTION") throw new Error("ROLE_FORBIDDEN");
  const db = await getDatabase();
  const caution = await db.collection<StoredCaution>(CAUTIONS_COLLECTION).findOne({
    _id: new ObjectId(cautionId),
    deletedAt: null,
  });
  if (!caution) throw new Error("CAUTION_NOT_FOUND");
  if (caution.immutableAfterFinal) throw new Error("CAUTION_IMMUTABLE");
  if (!["EN_ATTENTE", "A_CORRIGER"].includes(caution.status)) throw new Error("CAUTION_WRONG_STATUS");
  const now = new Date();
  await db.collection<StoredCaution>(CAUTIONS_COLLECTION).updateOne(
    { _id: caution._id },
    { $set: { status: "VALIDE_N1" as CautionStatus, updatedAt: now, updatedByUserId: actor._id ?? "" } },
  );
  const actionBy = userDisplayName(actor);
  await notifyRoleTargets(
    "ASSIST_CDS",
    "Caution : validation N2 attendue",
    `Opération caution | id ${cautionId} | action validation N2 attendue | acteur ${actionBy}.`,
    { cautionId, contratId: caution.contratId },
  );
}

export async function validateCautionN2(cautionId: string, actor: UserDocument) {
  if (!ObjectId.isValid(cautionId)) throw new Error("CAUTION_NOT_FOUND");
  if (actor.role !== "ASSIST_CDS") throw new Error("ROLE_FORBIDDEN");
  const db = await getDatabase();
  const caution = await db.collection<StoredCaution>(CAUTIONS_COLLECTION).findOne({
    _id: new ObjectId(cautionId),
    deletedAt: null,
  });
  if (!caution) throw new Error("CAUTION_NOT_FOUND");
  if (caution.immutableAfterFinal) throw new Error("CAUTION_IMMUTABLE");
  if (caution.status !== "VALIDE_N1") throw new Error("CAUTION_WRONG_STATUS");
  const now = new Date();
  await db.collection<StoredCaution>(CAUTIONS_COLLECTION).updateOne(
    { _id: caution._id },
    { $set: { status: "VALIDE_N2" as CautionStatus, updatedAt: now, updatedByUserId: actor._id ?? "" } },
  );
  const actionBy = userDisplayName(actor);
  await notifyRoleTargets(
    "CHEF_SERVICE",
    "Caution : finalisation attendue",
    `Opération caution | id ${cautionId} | action finalisation (paiement / rejet) attendue | acteur ${actionBy}.`,
    { cautionId, contratId: caution.contratId },
  );
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
  if (caution.status !== "VALIDE_N2") throw new Error("CAUTION_WRONG_STATUS");
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
  const actionBy = userDisplayName(actor);
  await notifyRoleTargets(
    "ASSIST_CDS",
    "Caution finalisee",
    `Opération caution | référence ${cautionId} | action caution passée à ${status} sur contrat ${caution.contratId} | acteur ${actionBy}.`,
    {
      cautionId,
      contratId: caution.contratId,
      status,
    },
  );
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
  if (!["EN_ATTENTE", "VALIDE_N1", "VALIDE_N2", "A_CORRIGER"].includes(caution.status)) {
    throw new Error("CAUTION_WRONG_STATUS");
  }
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
  const actionBy = userDisplayName(input.actor);
  await notifyRoleTargets(
    "ASSIST_CDS",
    "Caution retournee pour correction",
    `Opération caution | référence ${input.cautionId} | action caution retournée pour correction sur contrat ${caution.contratId} | acteur ${actionBy} | motif ${input.comment}`,
    {
      cautionId: input.cautionId,
      contratId: caution.contratId,
      status: "A_CORRIGER",
    },
  );
}

export async function listCautionAlertsJ10(agenceId?: string | null) {
  const thr = await getResolvedAlertThresholds();
  const db = await getDatabase();
  const today = new Date();
  const threshold = new Date(today);
  threshold.setDate(today.getDate() - thr.cautionOverdueDays);
  let scopedContratIds: string[] | null = null;
  if (agenceId?.trim()) {
    const concessionnaires = await db
      .collection<{ _id: string }>("concessionnaires")
      .find({ deletedAt: null, agenceId: agenceId.trim() }, { projection: { _id: 1 } })
      .toArray();
    const concessionnaireIds = concessionnaires.map((r) => String(r._id));
    if (concessionnaireIds.length === 0) {
      scopedContratIds = [];
    } else {
      const contrats = await db
        .collection<{ _id: string }>("contrats")
        .find({ deletedAt: null, concessionnaireId: { $in: concessionnaireIds } }, { projection: { _id: 1 } })
        .toArray();
      scopedContratIds = contrats.map((r) => String(r._id));
    }
  }
  const cautionFilter: Record<string, unknown> = {
    status: { $in: ["EN_ATTENTE", "A_CORRIGER", "VALIDE_N1", "VALIDE_N2"] },
    dueDate: { $lte: threshold },
    deletedAt: null,
  };
  if (scopedContratIds) {
    cautionFilter.contratId = { $in: scopedContratIds.length ? scopedContratIds : ["__none__"] };
  }
  const rows = await db.collection<StoredCaution>(CAUTIONS_COLLECTION).find({
    ...cautionFilter,
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
    `Opération résiliation | référence ${concessionnaire.codePdv} | action résiliation enregistrée | acteur ${userDisplayName(input.actor)} | motif ${input.reason}`,
  );
}

export const CAUTION_LIST_TABS = ["J10_OVERDUE", "EN_ATTENTE", "VALIDATED_THIS_MONTH"] as const;
export type CautionListTab = (typeof CAUTION_LIST_TABS)[number];

export interface CautionListRowDto {
  id: string;
  contratId: string;
  concessionnaireNom: string;
  produitCode: string;
  agenceLabel: string;
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

  const pendingStatuses = ["EN_ATTENTE", "A_CORRIGER", "VALIDE_N1", "VALIDE_N2"] as const;

  const [overdueJ10, enAttente, validatedThisMonth] = await Promise.all([
    db.collection(CAUTIONS_COLLECTION).countDocuments({
      ...base,
      status: { $in: [...pendingStatuses] },
      dueDate: { $lte: threshold },
    }),
    db.collection(CAUTIONS_COLLECTION).countDocuments({
      ...base,
      status: { $in: [...pendingStatuses] },
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
  let concessionnaireNomByContratId = new Map<string, string>();
  let produitByContratId = new Map<string, string>();
  let agenceByContratId = new Map<string, string>();
  if (contratIds.length > 0) {
    const contrats = await prisma.contrat.findMany({
      where: { id: { in: contratIds }, deletedAt: null },
      select: { id: true, concessionnaireId: true, produitCode: true },
    });
    const pdvIds = [...new Set(contrats.map((c) => c.concessionnaireId))];
    const concessionnaires =
      pdvIds.length === 0
        ? []
        : await prisma.concessionnaire.findMany({
            where: { id: { in: pdvIds }, deletedAt: null },
            select: { id: true, codePdv: true, nomComplet: true, raisonSociale: true, agenceId: true },
          });
    const pdvMap = new Map(concessionnaires.map((p) => [p.id, p.codePdv]));
    const concessionnaireById = new Map(concessionnaires.map((p) => [p.id, p]));
    const concessionnaireMap = new Map(
      concessionnaires.map((p) => [p.id, (p.nomComplet || p.raisonSociale || p.codePdv || "—").trim() || "—"]),
    );
    const agenceIds = [
      ...new Set(
        concessionnaires
          .map((p) => p.agenceId)
          .filter((v): v is string => typeof v === "string" && ObjectId.isValid(v)),
      ),
    ];
    const db = await getDatabase();
    const agences =
      agenceIds.length === 0
        ? []
        : await db
            .collection<{ _id: ObjectId; code: string; libelle: string }>("agences")
            .find(
              { _id: { $in: agenceIds.map((id) => new ObjectId(id)) } },
              { projection: { _id: 1, code: 1, libelle: 1 } },
            )
            .toArray();
    const agenceMap = new Map(
      agences.map((a) => [a._id.toHexString(), `${a.code} - ${a.libelle}`.trim() || a.code || "—"]),
    );
    pdvByContratId = new Map(
      contrats.map((c) => [c.id, pdvMap.get(c.concessionnaireId) ?? ""]),
    );
    concessionnaireNomByContratId = new Map(
      contrats.map((c) => [c.id, concessionnaireMap.get(c.concessionnaireId) ?? "—"]),
    );
    produitByContratId = new Map(
      contrats.map((c) => [c.id, (c.produitCode || "").trim() || "—"]),
    );
    agenceByContratId = new Map(
      contrats.map((c) => {
        const agenceId = concessionnaireById.get(c.concessionnaireId)?.agenceId ?? null;
        return [c.id, agenceId ? (agenceMap.get(agenceId) ?? agenceId) : "Sans agence"];
      }),
    );
  }

  return rows.map((row) => ({
    id: row._id.toHexString(),
    contratId: row.contratId,
    concessionnaireNom: concessionnaireNomByContratId.get(row.contratId) ?? "—",
    produitCode: produitByContratId.get(row.contratId) ?? "—",
    agenceLabel: agenceByContratId.get(row.contratId) ?? "Sans agence",
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

  const pendingStatuses = ["EN_ATTENTE", "A_CORRIGER", "VALIDE_N1", "VALIDE_N2"] as const;

  if (tab === "J10_OVERDUE") {
    filter = { ...base, status: { $in: [...pendingStatuses] }, dueDate: { $lte: threshold } };
  } else if (tab === "EN_ATTENTE") {
    filter = { ...base, status: { $in: [...pendingStatuses] }, dueDate: { $gt: threshold } };
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

const CAUTION_PENDING_STATUSES = ["EN_ATTENTE", "A_CORRIGER", "VALIDE_N1", "VALIDE_N2"] as const;

export interface ContratCautionAttendusDto {
  contratId: string;
  reference: string;
  produitCode: string;
  contratStatus: string;
  codePdv: string;
  nomPdv: string;
  montantTotalCautions: number;
  nombreCautionsAEncaisser: number;
  montantCautionsAEncaisser: number;
  nombreCautionsEncaissees: number;
  montantCautionsEncaissees: number;
  nombreCautionsNonEncaissees: number;
  montantCautionsNonEncaissees: number;
  ecartMontant: number;
}

function singleCautionAttendusMetrics(
  row: Pick<StoredCaution, "montant" | "status"> | null,
): Omit<
  ContratCautionAttendusDto,
  "contratId" | "reference" | "produitCode" | "contratStatus" | "codePdv" | "nomPdv"
> {
  const zero = (): Omit<
    ContratCautionAttendusDto,
    "contratId" | "reference" | "produitCode" | "contratStatus" | "codePdv" | "nomPdv"
  > => ({
    montantTotalCautions: 0,
    nombreCautionsAEncaisser: 0,
    montantCautionsAEncaisser: 0,
    nombreCautionsEncaissees: 0,
    montantCautionsEncaissees: 0,
    nombreCautionsNonEncaissees: 0,
    montantCautionsNonEncaissees: 0,
    ecartMontant: 0,
  });
  if (!row) return zero();
  const status = row.status as string;
  if (status === "ANNULEE") return zero();
  const m = Number.isFinite(row.montant) ? row.montant : 0;
  let nAEncaisser = 0;
  let mAEncaisser = 0;
  let nPayee = 0;
  let mPayee = 0;
  let nNonEnc = 0;
  let mNonEnc = 0;
  if (status === "PAYEE") {
    nPayee = 1;
    mPayee = m;
  } else if (CAUTION_PENDING_STATUSES.includes(status as (typeof CAUTION_PENDING_STATUSES)[number])) {
    nNonEnc = 1;
    mNonEnc = m;
    if (status === "VALIDE_N2") {
      nAEncaisser = 1;
      mAEncaisser = m;
    }
  }
  return {
    montantTotalCautions: m,
    nombreCautionsAEncaisser: nAEncaisser,
    montantCautionsAEncaisser: mAEncaisser,
    nombreCautionsEncaissees: nPayee,
    montantCautionsEncaissees: mPayee,
    nombreCautionsNonEncaissees: nNonEnc,
    montantCautionsNonEncaissees: mNonEnc,
    ecartMontant: mNonEnc - mPayee,
  };
}

/**
 * Indicateurs caution par contrat (0 ou 1 caution par contrat) : à encaisser (VALIDE_N2), encaissées (PAYEE), etc.
 */
export async function listContratsCautionAttendus(
  listBase: Omit<ListContratsParams, "page" | "pageSize">,
): Promise<ContratCautionAttendusDto[]> {
  await ensureSprint4Indexes();
  const contrats = await listContratsAllMatching(listBase);
  if (contrats.length === 0) return [];

  const ids = contrats.map((c) => c.id);
  const db = await getDatabase();
  const cautionRows = await db
    .collection<StoredCaution>(CAUTIONS_COLLECTION)
    .find({ contratId: { $in: ids }, deletedAt: null })
    .toArray();
  const cautionByContratId = new Map(cautionRows.map((c) => [c.contratId, c]));

  const pdvIds = [...new Set(contrats.map((c) => c.concessionnaireId))];
  const concessionnaires =
    pdvIds.length === 0
      ? []
      : await prisma.concessionnaire.findMany({
          where: { id: { in: pdvIds }, deletedAt: null },
          select: { id: true, codePdv: true, nomComplet: true, raisonSociale: true },
        });
  const pdvMeta = new Map(
    concessionnaires.map((p) => [
      p.id,
      {
        code: p.codePdv ?? "",
        nom: (p.nomComplet || p.raisonSociale || p.codePdv || "").trim() || "—",
      },
    ]),
  );

  return contrats.map((c) => {
    const cau = cautionByContratId.get(c.id) ?? null;
    const metrics = singleCautionAttendusMetrics(cau);
    const pdv = pdvMeta.get(c.concessionnaireId);
    return {
      contratId: c.id,
      reference: c.reference,
      produitCode: c.produitCode,
      contratStatus: c.status,
      codePdv: pdv?.code ?? "",
      nomPdv: pdv?.nom ?? "—",
      ...metrics,
    };
  });
}

const MONTHLY_ETAT_PENDING = ["EN_ATTENTE", "A_CORRIGER", "VALIDE_N1", "VALIDE_N2"] as const;

function calendarMonthBounds(year: number, monthIndex0to11: number): { start: Date; end: Date } {
  const start = new Date(year, monthIndex0to11, 1, 0, 0, 0, 0);
  const end = new Date(year, monthIndex0to11 + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

function formatYearMonthLabel(year: number, monthIndex0to11: number): string {
  return `${year}-${String(monthIndex0to11 + 1).padStart(2, "0")}`;
}

function monthTitleFr(year: number, monthIndex0to11: number): string {
  const d = new Date(year, monthIndex0to11, 1);
  return new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(d);
}

function lastNCalendarMonths(n: number): { year: number; monthIndex: number; yearMonth: string; moisLabel: string }[] {
  const out: { year: number; monthIndex: number; yearMonth: string; moisLabel: string }[] = [];
  const anchor = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(anchor.getFullYear(), anchor.getMonth() - i, 1);
    const year = d.getFullYear();
    const monthIndex = d.getMonth();
    out.push({
      year,
      monthIndex,
      yearMonth: formatYearMonthLabel(year, monthIndex),
      moisLabel: monthTitleFr(year, monthIndex),
    });
  }
  return out;
}

function cautionAnnulledByEnd(c: StoredCaution, monthEnd: Date): boolean {
  return c.status === "ANNULEE" && c.updatedAt <= monthEnd;
}

function cautionPaidByEnd(c: StoredCaution, monthEnd: Date): boolean {
  return Boolean(c.paidAt && c.paidAt <= monthEnd);
}

function cautionInScopeAtMonthEnd(c: StoredCaution, monthEnd: Date): boolean {
  if (c.createdAt > monthEnd) return false;
  if (c.deletedAt && c.deletedAt <= monthEnd) return false;
  return true;
}

function cautionEncaisseePendantMois(c: StoredCaution, monthStart: Date, monthEnd: Date): boolean {
  return Boolean(
    c.paidAt && c.paidAt >= monthStart && c.paidAt <= monthEnd && c.status === "PAYEE",
  );
}

export interface CautionEtatMensuelProduitRow {
  yearMonth: string;
  moisLabel: string;
  produitCode: string;
  libelle: string;
  montantAttendusCautions: number;
  nombreCautionsAEncaisser: number;
  montantCautionsAEncaisser: number;
  montantCautionsEncaissees: number;
  nombreCautionsEncaissees: number;
  ecartMontant: number;
  montantCautionsNonEncaissees: number;
  nombreCautionsNonEncaissees: number;
}

type CautionEtatMensuelMetricsFields = Pick<
  CautionEtatMensuelProduitRow,
  | "montantAttendusCautions"
  | "nombreCautionsAEncaisser"
  | "montantCautionsAEncaisser"
  | "montantCautionsEncaissees"
  | "nombreCautionsEncaissees"
  | "ecartMontant"
  | "montantCautionsNonEncaissees"
  | "nombreCautionsNonEncaissees"
>;

function emptyCautionEtatMensuelMetrics(): CautionEtatMensuelMetricsFields {
  return {
    montantAttendusCautions: 0,
    nombreCautionsAEncaisser: 0,
    montantCautionsAEncaisser: 0,
    montantCautionsEncaissees: 0,
    nombreCautionsEncaissees: 0,
    ecartMontant: 0,
    montantCautionsNonEncaissees: 0,
    nombreCautionsNonEncaissees: 0,
  };
}

function accumulateCautionForMonthMetrics(
  c: StoredCaution,
  MStart: Date,
  MEnd: Date,
  acc: CautionEtatMensuelMetricsFields,
): void {
  if (cautionEncaisseePendantMois(c, MStart, MEnd)) {
    const m = Number.isFinite(c.montant) ? c.montant : 0;
    acc.montantCautionsEncaissees += m;
    acc.nombreCautionsEncaissees += 1;
  }

  if (!cautionInScopeAtMonthEnd(c, MEnd)) return;
  if (cautionAnnulledByEnd(c, MEnd)) return;
  if (cautionPaidByEnd(c, MEnd)) return;

  const m = Number.isFinite(c.montant) ? c.montant : 0;
  acc.montantAttendusCautions += m;

  const st = c.status as string;
  if (st === "VALIDE_N2") {
    acc.nombreCautionsAEncaisser += 1;
    acc.montantCautionsAEncaisser += m;
  }
  if (MONTHLY_ETAT_PENDING.includes(st as (typeof MONTHLY_ETAT_PENDING)[number])) {
    acc.nombreCautionsNonEncaissees += 1;
    acc.montantCautionsNonEncaissees += m;
  }
}

function finalizeCautionEtatMensuelMetrics(acc: CautionEtatMensuelMetricsFields): void {
  acc.ecartMontant = acc.montantCautionsNonEncaissees - acc.montantCautionsEncaissees;
}

function computeCautionBucketMetrics(
  cautionRows: readonly StoredCaution[],
  MStart: Date,
  MEnd: Date,
  includeCaution: (c: StoredCaution) => boolean,
): CautionEtatMensuelMetricsFields {
  const acc = emptyCautionEtatMensuelMetrics();
  for (const c of cautionRows) {
    if (!includeCaution(c)) continue;
    accumulateCautionForMonthMetrics(c, MStart, MEnd, acc);
  }
  finalizeCautionEtatMensuelMetrics(acc);
  return acc;
}

export async function listCautionEtatMensuelParProduit(months: number): Promise<CautionEtatMensuelProduitRow[]> {
  await ensureSprint4Indexes();
  const n = Math.min(36, Math.max(1, Math.floor(months)));
  const monthDefs = lastNCalendarMonths(n);

  const oldestStart = calendarMonthBounds(
    monthDefs[monthDefs.length - 1]!.year,
    monthDefs[monthDefs.length - 1]!.monthIndex,
  ).start;

  const db = await getDatabase();
  const cautionRows = await db
    .collection<StoredCaution>(CAUTIONS_COLLECTION)
    .find(
      {
        deletedAt: null,
        $or: [
          { createdAt: { $gte: oldestStart } },
          { paidAt: { $gte: oldestStart } },
          { status: { $in: [...MONTHLY_ETAT_PENDING] } },
        ],
      },
      { projection: { contratId: 1, montant: 1, status: 1, paidAt: 1, createdAt: 1, updatedAt: 1, deletedAt: 1 } },
    )
    .toArray();

  const contratIds = [...new Set(cautionRows.map((r) => r.contratId))];
  const contrats =
    contratIds.length === 0
      ? []
      : await prisma.contrat.findMany({
          where: { id: { in: contratIds }, deletedAt: null },
          select: { id: true, produitCode: true },
        });
  const produitByContratId = new Map(
    contrats.map((c) => [c.id, (c.produitCode || "").trim().toUpperCase() || "—"]),
  );

  const produits = await listProduits();
  const libelleByCode = new Map(produits.map((p) => [p.code.toUpperCase(), p.libelle]));
  const activeCodes = new Set(produits.filter((p) => p.actif).map((p) => p.code.toUpperCase()));

  const codesFromData = new Set<string>();
  for (const row of cautionRows) {
    const pc = produitByContratId.get(row.contratId) ?? "—";
    codesFromData.add(pc);
  }
  for (const c of activeCodes) codesFromData.add(c);

  const allCodes = [...codesFromData].sort((a, b) => a.localeCompare(b, "fr"));
  const rows: CautionEtatMensuelProduitRow[] = [];

  for (const md of monthDefs) {
    const { start: MStart, end: MEnd } = calendarMonthBounds(md.year, md.monthIndex);
    for (const produitCode of allCodes) {
      const metrics = computeCautionBucketMetrics(cautionRows, MStart, MEnd, (c) => {
        const pc = produitByContratId.get(c.contratId) ?? "—";
        return pc === produitCode;
      });
      const hasAny =
        metrics.montantAttendusCautions > 0 ||
        metrics.nombreCautionsAEncaisser > 0 ||
        metrics.montantCautionsAEncaisser > 0 ||
        metrics.montantCautionsEncaissees > 0 ||
        metrics.nombreCautionsEncaissees > 0 ||
        metrics.montantCautionsNonEncaissees > 0 ||
        metrics.nombreCautionsNonEncaissees > 0;
      if (!hasAny && !activeCodes.has(produitCode)) continue;
      rows.push({
        yearMonth: md.yearMonth,
        moisLabel: md.moisLabel,
        produitCode,
        libelle: libelleByCode.get(produitCode) ?? (produitCode === "—" ? "Sans code produit" : "Hors référentiel"),
        ...metrics,
      });
    }
  }

  return rows;
}

function contratMatrixAgencePartitionKey(agenceId: string | null | undefined): string {
  return agenceId?.trim() || "__sans_agence__";
}

export interface ContratEtatMensuelMatrixAgenceCol {
  agenceKey: string;
  libelle: string;
}

export interface ContratEtatMensuelMatrixProduitRow {
  produitCode: string;
  libelle: string;
  valeursParAgence: Record<string, number>;
  totalContrats: number;
}

export interface ContratEtatMensuelMatrixZone {
  agences: ContratEtatMensuelMatrixAgenceCol[];
  produits: ContratEtatMensuelMatrixProduitRow[];
}

export interface ContratEtatMensuelMatrixMonth {
  yearMonth: string;
  moisLabel: string;
  zoneAbidjan: ContratEtatMensuelMatrixZone | null;
  interieur: ContratEtatMensuelMatrixZone | null;
}

function buildMatrixZoneFull(
  pairValues: Map<string, number>,
  pairKeyFn: (produitCode: string, agenceKey: string) => string,
  agenceCols: ContratEtatMensuelMatrixAgenceCol[],
  produitCodesSorted: readonly string[],
  libelleByCode: Map<string, string>,
): ContratEtatMensuelMatrixZone | null {
  if (agenceCols.length === 0 || produitCodesSorted.length === 0) return null;
  const produits: ContratEtatMensuelMatrixProduitRow[] = [];
  for (const produitCode of produitCodesSorted) {
    const valeursParAgence: Record<string, number> = {};
    let totalContrats = 0;
    for (const col of agenceCols) {
      const v = pairValues.get(pairKeyFn(produitCode, col.agenceKey)) ?? 0;
      valeursParAgence[col.agenceKey] = v;
      totalContrats += v;
    }
    produits.push({
      produitCode,
      libelle: libelleByCode.get(produitCode) ?? (produitCode === "—" ? "Sans code produit" : "Hors référentiel"),
      valeursParAgence,
      totalContrats,
    });
  }
  return { agences: agenceCols, produits };
}

export async function listContratEtatMensuelProduitAgenceMatrix(
  months: number,
): Promise<ContratEtatMensuelMatrixMonth[]> {
  await ensureSprint4Indexes();
  const n = Math.min(36, Math.max(1, Math.floor(months)));
  const monthDefs = lastNCalendarMonths(n);
  const oldestStart = calendarMonthBounds(
    monthDefs[monthDefs.length - 1]!.year,
    monthDefs[monthDefs.length - 1]!.monthIndex,
  ).start;

  const db = await getDatabase();
  const contrats = await prisma.contrat.findMany({
    where: { deletedAt: null, createdAt: { gte: oldestStart } },
    select: { id: true, produitCode: true, concessionnaireId: true, createdAt: true },
  });

  const pdvIds = [...new Set(contrats.map((c) => c.concessionnaireId))];
  const pdvs =
    pdvIds.length === 0
      ? []
      : await prisma.concessionnaire.findMany({
          where: { id: { in: pdvIds }, deletedAt: null },
          select: { id: true, agenceId: true },
        });
  const pdvById = new Map(pdvs.map((p) => [p.id, p]));

  const contratById = new Map<
    string,
    { produitCode: string; agenceKey: string; createdAt: Date }
  >();
  for (const ct of contrats) {
    const pdv = pdvById.get(ct.concessionnaireId);
    const agenceKey = contratMatrixAgencePartitionKey(pdv?.agenceId ?? null);
    const produitCode = (ct.produitCode || "").trim().toUpperCase() || "—";
    contratById.set(ct.id, { produitCode, agenceKey, createdAt: ct.createdAt });
  }

  const hasSansAgence = [...contratById.values()].some((z) => z.agenceKey === "__sans_agence__");

  const produitsRef = await listProduits();
  const libelleByCode = new Map(produitsRef.map((p) => [p.code.toUpperCase(), p.libelle]));
  const activeCodes = new Set(produitsRef.filter((p) => p.actif).map((p) => p.code.toUpperCase()));
  const codesFromData = new Set<string>();
  for (const ct of contrats) {
    const z = contratById.get(ct.id);
    if (z) codesFromData.add(z.produitCode);
  }
  for (const c of activeCodes) codesFromData.add(c);
  const allProduitCodesSorted = [...codesFromData].sort((a, b) => a.localeCompare(b, "fr"));

  const allAgenceDocs = await db
    .collection<{ _id: ObjectId; actif?: boolean }>("agences")
    .find({ $or: [{ actif: true }, { actif: { $exists: false } }] })
    .project({ _id: 1 })
    .toArray();
  const abidjanAgenceIds = new Set(await listAgenceIdsZoneAbidjan(db));
  const agenceIdsForLabels = allAgenceDocs.map((d) => d._id.toHexString());
  const agenceLibelleFull = await loadAgenceLibelleMap(db, agenceIdsForLabels);
  const colFor = (id: string): ContratEtatMensuelMatrixAgenceCol => ({
    agenceKey: id,
    libelle: formatAgenceLibelle(agenceLibelleFull.get(id), id),
  });
  const abidjanColsSorted = allAgenceDocs
    .filter((d) => abidjanAgenceIds.has(d._id.toHexString()))
    .map((d) => colFor(d._id.toHexString()))
    .sort((a, b) => a.libelle.localeCompare(b.libelle, "fr", { sensitivity: "base" }));
  const interieurCoreCols = allAgenceDocs
    .filter((d) => !abidjanAgenceIds.has(d._id.toHexString()))
    .map((d) => colFor(d._id.toHexString()))
    .sort((a, b) => a.libelle.localeCompare(b.libelle, "fr", { sensitivity: "base" }));
  const interieurCols = hasSansAgence
    ? [...interieurCoreCols, { agenceKey: "__sans_agence__", libelle: "Sans agence PDV" }]
    : interieurCoreCols;

  const out: ContratEtatMensuelMatrixMonth[] = [];
  const PAIR_SEP = "\x1f";
  const pairKey = (produitCode: string, agenceKey: string) => `${produitCode}${PAIR_SEP}${agenceKey}`;

  for (const md of monthDefs) {
    const { start: MStart, end: MEnd } = calendarMonthBounds(md.year, md.monthIndex);
    const pairValues = new Map<string, number>();
    for (const z of contratById.values()) {
      if (z.createdAt < MStart || z.createdAt > MEnd) continue;
      const k = pairKey(z.produitCode, z.agenceKey);
      pairValues.set(k, (pairValues.get(k) ?? 0) + 1);
    }

    const zoneAbidjan = buildMatrixZoneFull(
      pairValues,
      pairKey,
      abidjanColsSorted,
      allProduitCodesSorted,
      libelleByCode,
    );
    const interieur = buildMatrixZoneFull(
      pairValues,
      pairKey,
      interieurCols,
      allProduitCodesSorted,
      libelleByCode,
    );
    if (zoneAbidjan || interieur) {
      out.push({ yearMonth: md.yearMonth, moisLabel: md.moisLabel, zoneAbidjan, interieur });
    }
  }

  return out;
}


