import { ObjectId } from "mongodb";

import type { AttestationDomiciliationStatus, AttestationDomiciliationType } from "@/lib/lonaci/constants";
import { getDatabase } from "@/lib/mongodb";

const COLLECTION = "attestations_domiciliation";

interface DemandeStored {
  _id: ObjectId;
  type: AttestationDomiciliationType;
  concessionnaireId: string | null;
  produitCode: string | null;
  dateDemande: Date;
  statut: AttestationDomiciliationStatus;
  observations: string | null;
  createdByUserId: string;
  updatedByUserId: string;
  transmittedByUserId: string | null;
  finalizedByUserId: string | null;
  transmittedAt: Date | null;
  finalizedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export async function ensureAttestationsDomiciliationIndexes() {
  const db = await getDatabase();
  await db.collection<DemandeStored>(COLLECTION).createIndexes([
    { key: { dateDemande: -1 }, name: "idx_date_demande" },
    { key: { statut: 1, updatedAt: -1 }, name: "idx_statut_updated" },
    { key: { type: 1, dateDemande: -1 }, name: "idx_type_date" },
    { key: { concessionnaireId: 1, dateDemande: -1 }, name: "idx_concessionnaire_date" },
    { key: { produitCode: 1, dateDemande: -1 }, name: "idx_produit_date" },
    { key: { deletedAt: 1 }, name: "idx_deleted" },
  ]);
}

export async function createDemandeAttestationDomiciliation(input: {
  type: AttestationDomiciliationType;
  concessionnaireId: string | null;
  produitCode: string | null;
  dateDemande: Date;
  observations: string | null;
  actorId: string;
}) {
  const db = await getDatabase();
  const now = new Date();
  const doc: Omit<DemandeStored, "_id"> = {
    type: input.type,
    concessionnaireId: input.concessionnaireId,
    produitCode: input.produitCode ? input.produitCode.trim().toUpperCase() : null,
    dateDemande: input.dateDemande,
    statut: "DEMANDE_RECUE",
    observations: input.observations,
    createdByUserId: input.actorId,
    updatedByUserId: input.actorId,
    transmittedByUserId: null,
    finalizedByUserId: null,
    transmittedAt: null,
    finalizedAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  const res = await db.collection<DemandeStored>(COLLECTION).insertOne(doc as DemandeStored);
  return { id: res.insertedId.toHexString(), statut: doc.statut };
}

export async function transitionDemandeAttestationDomiciliation(input: {
  id: string;
  target: AttestationDomiciliationStatus;
  role: string;
  actorId: string;
}) {
  if (!ObjectId.isValid(input.id)) throw new Error("DEMANDE_NOT_FOUND");
  const db = await getDatabase();
  const row = await db
    .collection<DemandeStored>(COLLECTION)
    .findOne({ _id: new ObjectId(input.id), deletedAt: null });
  if (!row) throw new Error("DEMANDE_NOT_FOUND");

  const now = new Date();
  const $set: Record<string, unknown> = {
    statut: input.target,
    updatedAt: now,
    updatedByUserId: input.actorId,
  };

  if (row.statut === "DEMANDE_RECUE" && input.target === "TRANSMIS") {
    if (!["ASSIST_CDS", "CHEF_SERVICE"].includes(input.role)) throw new Error("FORBIDDEN_TRANSITION");
    $set.transmittedAt = now;
    $set.transmittedByUserId = input.actorId;
  } else if (row.statut === "TRANSMIS" && input.target === "FINALISE") {
    if (!["CHEF_SERVICE"].includes(input.role)) throw new Error("FORBIDDEN_TRANSITION");
    $set.finalizedAt = now;
    $set.finalizedByUserId = input.actorId;
  } else {
    throw new Error("INVALID_TRANSITION");
  }

  await db.collection<DemandeStored>(COLLECTION).updateOne({ _id: row._id }, { $set });
}

export async function listDemandesAttestationsDomiciliation(input: {
  page: number;
  pageSize: number;
  type?: AttestationDomiciliationType;
  concessionnaireId?: string;
  produitCode?: string;
  statut?: AttestationDomiciliationStatus;
  dateFrom?: Date;
  dateTo?: Date;
}) {
  const db = await getDatabase();
  const filter: Record<string, unknown> = { deletedAt: null };
  if (input.type) filter.type = input.type;
  if (input.concessionnaireId) filter.concessionnaireId = input.concessionnaireId;
  if (input.produitCode) filter.produitCode = input.produitCode.trim().toUpperCase();
  if (input.statut) filter.statut = input.statut;
  if (input.dateFrom || input.dateTo) {
    const r: Record<string, Date> = {};
    if (input.dateFrom) r.$gte = input.dateFrom;
    if (input.dateTo) r.$lte = input.dateTo;
    filter.dateDemande = r;
  }

  const col = db.collection<DemandeStored>(COLLECTION);
  const skip = (input.page - 1) * input.pageSize;
  const [total, rows] = await Promise.all([
    col.countDocuments(filter),
    col.find(filter).sort({ dateDemande: -1, createdAt: -1 }).skip(skip).limit(input.pageSize).toArray(),
  ]);

  return {
    items: rows.map((r) => ({
      id: r._id.toHexString(),
      type: r.type,
      concessionnaireId: r.concessionnaireId,
      produitCode: r.produitCode,
      dateDemande: r.dateDemande.toISOString(),
      statut: r.statut,
      observations: r.observations,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
    total,
    page: input.page,
    pageSize: input.pageSize,
  };
}

