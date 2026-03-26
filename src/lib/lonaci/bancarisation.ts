import { ObjectId } from "mongodb";
import { Prisma } from "@prisma/client";

import { type BancarisationStatut } from "@/lib/lonaci/constants";
import { appendAuditLog } from "@/lib/lonaci/audit";
import type {
  BancarisationRequestDocument,
  BancarisationRequestStatus,
  UserDocument,
} from "@/lib/lonaci/types";
import { getDatabase } from "@/lib/mongodb";
import { prisma } from "@/lib/prisma";

const BANCARISATION_REQUESTS_COLLECTION = "bancarisation_requests";

type StoredBancarisationRequest = {
  _id: ObjectId;
  concessionnaireId: string;
  agenceId: string | null;
  produitCode: string | null;
  statutActuel: string;
  nouveauStatut: string;
  compteBancaire: string | null;
  banqueEtablissement: string | null;
  dateEffet: Date;
  justificatif: {
    pieceId?: string;
    filename?: string;
    mimeType?: string;
    size?: number;
    url?: string;
  } | null;
  status: string;
  validationComment: string | null;
  validatedByUserId: string | null;
  validatedAt: Date | null;
  createdByUserId: string;
  updatedByUserId: string;
  createdAt: Date;
  updatedAt: Date;
};

function mapRequest(row: StoredBancarisationRequest): BancarisationRequestDocument {
  const j = row.justificatif ?? {};
  return {
    _id: row._id.toHexString(),
    concessionnaireId: row.concessionnaireId,
    agenceId: row.agenceId,
    produitCode: row.produitCode,
    statutActuel: row.statutActuel as BancarisationStatut,
    nouveauStatut: row.nouveauStatut as BancarisationStatut,
    compteBancaire: row.compteBancaire,
    banqueEtablissement: row.banqueEtablissement,
    dateEffet: row.dateEffet,
    justificatif: {
      pieceId: j.pieceId ?? "",
      filename: j.filename ?? "",
      mimeType: j.mimeType ?? "",
      size: typeof j.size === "number" ? j.size : 0,
      url: j.url ?? "",
    },
    status: row.status as BancarisationRequestStatus,
    validationComment: row.validationComment,
    validatedByUserId: row.validatedByUserId,
    validatedAt: row.validatedAt,
    createdByUserId: row.createdByUserId,
    updatedByUserId: row.updatedByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function getBancarisationRequestsCollection() {
  const db = await getDatabase();
  return db.collection<StoredBancarisationRequest>(BANCARISATION_REQUESTS_COLLECTION);
}

export async function createBancarisationRequest(input: {
  concessionnaireId: string;
  agenceId: string | null;
  produitCode: string | null;
  statutActuel: BancarisationStatut;
  nouveauStatut: BancarisationStatut;
  compteBancaire: string | null;
  banqueEtablissement: string | null;
  dateEffet: Date;
  justificatif: BancarisationRequestDocument["justificatif"];
  createdByUserId: string;
}) {
  const col = await getBancarisationRequestsCollection();
  const now = new Date();
  const doc: Omit<StoredBancarisationRequest, "_id"> = {
    concessionnaireId: input.concessionnaireId,
    agenceId: input.agenceId,
    produitCode: input.produitCode,
    statutActuel: input.statutActuel,
    nouveauStatut: input.nouveauStatut,
    compteBancaire: input.compteBancaire,
    banqueEtablissement: input.banqueEtablissement,
    dateEffet: input.dateEffet,
    justificatif: input.justificatif,
    status: "SOUMIS",
    validationComment: null,
    validatedByUserId: null,
    validatedAt: null,
    createdByUserId: input.createdByUserId,
    updatedByUserId: input.createdByUserId,
    createdAt: now,
    updatedAt: now,
  };
  const result = await col.insertOne(doc as StoredBancarisationRequest);
  return mapRequest({ _id: result.insertedId, ...doc });
}

export async function listBancarisationRequests(input: {
  page: number;
  pageSize: number;
  status?: BancarisationRequestStatus;
  statut?: BancarisationStatut;
  agenceId?: string;
  scopeAgenceId?: string;
}) {
  const col = await getBancarisationRequestsCollection();
  const where: Record<string, unknown> = {};
  if (input.scopeAgenceId) where.agenceId = input.scopeAgenceId;
  else if (input.agenceId) where.agenceId = input.agenceId;
  if (input.status) where.status = input.status;
  if (input.statut) where.nouveauStatut = input.statut;

  const skip = (input.page - 1) * input.pageSize;
  const [total, rows] = await Promise.all([
    col.countDocuments(where),
    col.find(where).sort({ createdAt: -1 }).skip(skip).limit(input.pageSize).toArray(),
  ]);
  return { total, items: rows.map(mapRequest) };
}

export async function findBancarisationRequestById(id: string) {
  if (!ObjectId.isValid(id)) return null;
  const col = await getBancarisationRequestsCollection();
  const row = await col.findOne({ _id: new ObjectId(id) });
  return row ? mapRequest(row) : null;
}

export async function validateBancarisationRequest(input: {
  requestId: string;
  decision: "VALIDER" | "REJETER";
  comment: string | null;
  actor: UserDocument;
}) {
  if (!ObjectId.isValid(input.requestId)) throw new Error("REQUEST_NOT_FOUND");
  const col = await getBancarisationRequestsCollection();
  const objectId = new ObjectId(input.requestId);
  const existing = await col.findOne({ _id: objectId });
  if (!existing) throw new Error("REQUEST_NOT_FOUND");
  if (existing.status !== "SOUMIS") throw new Error("REQUEST_NOT_PENDING");

  const now = new Date();
  const status = input.decision === "VALIDER" ? "VALIDE" : "REJETE";

  await col.updateOne(
    { _id: objectId },
    {
      $set: {
      status,
      validationComment: input.comment,
      validatedByUserId: input.actor._id ?? "",
      validatedAt: now,
      updatedByUserId: input.actor._id ?? "",
      updatedAt: now,
      },
    },
  );
  const updated = await col.findOne({ _id: objectId });
  if (!updated) throw new Error("REQUEST_NOT_FOUND");

  if (input.decision === "VALIDER") {
    await prisma.concessionnaire.updateMany({
      where: { id: existing.concessionnaireId, deletedAt: null },
      data: {
        statutBancarisation: existing.nouveauStatut,
        compteBancaire: existing.nouveauStatut === "BANCARISE" ? existing.compteBancaire : null,
        banqueEtablissement: existing.banqueEtablissement,
        updatedByUserId: input.actor._id ?? "",
        updatedAt: now,
      },
    });
  }

  await appendAuditLog({
    entityType: "CONCESSIONNAIRE",
    entityId: existing.concessionnaireId,
    action: "BANCARISATION_DECISION",
    userId: input.actor._id ?? "",
    details: {
      requestId: input.requestId,
      decision: input.decision,
      statusAfter: status,
      nouveauStatut: existing.nouveauStatut,
    },
  });

  return mapRequest(updated);
}

export async function bancarisationCountersByAgenceProduit(scopeAgenceId?: string) {
  const where: Prisma.ConcessionnaireWhereInput = { deletedAt: null };
  if (scopeAgenceId) where.agenceId = scopeAgenceId;
  const rows = await prisma.concessionnaire.findMany({
    where,
    select: { agenceId: true, statutBancarisation: true, produitsAutorises: true },
  });

  const map = new Map<string, { agenceId: string | null; produitCode: string; NON_BANCARISE: number; EN_COURS: number; BANCARISE: number }>();
  for (const row of rows) {
    const statut = (row.statutBancarisation ?? "NON_BANCARISE") as BancarisationStatut;
    const produits = row.produitsAutorises.length > 0 ? row.produitsAutorises : ["SANS_PRODUIT"];
    for (const p of produits) {
      const code = p.trim().toUpperCase() || "SANS_PRODUIT";
      const key = `${row.agenceId ?? "NO_AGENCE"}::${code}`;
      if (!map.has(key)) {
        map.set(key, {
          agenceId: row.agenceId,
          produitCode: code,
          NON_BANCARISE: 0,
          EN_COURS: 0,
          BANCARISE: 0,
        });
      }
      const item = map.get(key)!;
      item[statut] += 1;
    }
  }
  return [...map.values()].sort((a, b) => {
    if ((a.agenceId ?? "") !== (b.agenceId ?? "")) return (a.agenceId ?? "").localeCompare(b.agenceId ?? "");
    return a.produitCode.localeCompare(b.produitCode);
  });
}

export function sanitizeBancarisationRequestPublic(doc: BancarisationRequestDocument) {
  return {
    id: doc._id ?? "",
    concessionnaireId: doc.concessionnaireId,
    agenceId: doc.agenceId,
    produitCode: doc.produitCode,
    statutActuel: doc.statutActuel,
    nouveauStatut: doc.nouveauStatut,
    compteBancaire: doc.compteBancaire,
    banqueEtablissement: doc.banqueEtablissement,
    dateEffet: doc.dateEffet.toISOString(),
    justificatif: doc.justificatif,
    status: doc.status,
    validationComment: doc.validationComment,
    validatedByUserId: doc.validatedByUserId,
    validatedAt: doc.validatedAt ? doc.validatedAt.toISOString() : null,
    createdByUserId: doc.createdByUserId,
    updatedByUserId: doc.updatedByUserId,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}
