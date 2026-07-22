import { ObjectId } from "mongodb";
import { Prisma } from "@prisma/client";

import {
  buildWorkflowVisibilityMongoFilter,
  isWorkflowDocumentVisible,
  isWorkflowStageAssignedToRole,
} from "@/lib/auth/workflow-visibility";
import { canReadConcessionnaire } from "@/lib/lonaci/access";
import { restrictionToMongoAgenceFilter, restrictionToPrismaAgenceWhere } from "@/lib/lonaci/list-agence-restriction";
import { type BancarisationStatut } from "@/lib/lonaci/constants";
import {
  emptyBancarisationStatutCounts,
  incrementBancarisationStatutCount,
  normalizeBancarisationStatut,
} from "@/lib/lonaci/bancarisation-statut";
import { appendAuditLog } from "@/lib/lonaci/audit";
import type {
  BancarisationRequestDocument,
  BancarisationRequestStatus,
  UserDocument,
} from "@/lib/lonaci/types";
import { findConcessionnaireById } from "@/lib/lonaci/concessionnaires";
import {
  areWorkflowApprovalsEnabled,
  isOperationalWorkflowRole,
} from "@/lib/lonaci/workflow-approvals";
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
  scopeAgenceIds?: string[];
  visibility?: Pick<UserDocument, "_id" | "role">;
}) {
  const col = await getBancarisationRequestsCollection();
  const where: Record<string, unknown> = {};
  const agenceFilter = restrictionToMongoAgenceFilter({
    agenceId: input.scopeAgenceId ?? input.agenceId,
    agenceIds: input.scopeAgenceIds,
  });
  if (agenceFilter) where.agenceId = agenceFilter;
  if (input.status) where.status = input.status;
  if (input.statut) where.nouveauStatut = input.statut;
  const visibilityFilter = input.visibility
    ? buildWorkflowVisibilityMongoFilter({
        workflow: "BANCARISATION",
        role: input.visibility.role,
        userId: input.visibility._id ?? "",
      })
    : null;
  const effectiveWhere: Record<string, unknown> = visibilityFilter
    ? { $and: [where, visibilityFilter] }
    : where;

  const skip = (input.page - 1) * input.pageSize;
  const [total, rows] = await Promise.all([
    col.countDocuments(effectiveWhere),
    col.find(effectiveWhere).sort({ createdAt: -1 }).skip(skip).limit(input.pageSize).toArray(),
  ]);
  return { total, items: rows.map(mapRequest) };
}

export async function findBancarisationRequestById(id: string) {
  if (!ObjectId.isValid(id)) return null;
  const col = await getBancarisationRequestsCollection();
  const row = await col.findOne({ _id: new ObjectId(id) });
  return row ? mapRequest(row) : null;
}

const BANCARISATION_PENDING_STATUSES = ["SOUMIS", "VALIDE_N1", "VALIDE_N2"] as const;

export async function countBancarisationRequestsByStatus(
  scopeAgenceId?: string | null,
  scopeAgenceIds?: string[],
  actor?: Pick<UserDocument, "_id" | "role">,
) {
  const col = await getBancarisationRequestsCollection();
  const match: Record<string, unknown> = {};
  const agenceFilter = restrictionToMongoAgenceFilter({
    agenceId: scopeAgenceId ?? undefined,
    agenceIds: scopeAgenceIds,
  });
  if (agenceFilter) match.agenceId = agenceFilter;
  const visibility = actor
    ? buildWorkflowVisibilityMongoFilter({
        workflow: "BANCARISATION",
        role: actor.role,
        userId: actor._id ?? "",
      })
    : null;
  const effectiveMatch = visibility ? { $and: [match, visibility] } : match;
  const rows = await col
    .aggregate<{ _id: string; c: number }>([
      { $match: effectiveMatch },
      { $group: { _id: "$status", c: { $sum: 1 } } },
    ])
    .toArray();
  const out: Record<string, number> = {
    SOUMIS: 0,
    VALIDE_N1: 0,
    VALIDE_N2: 0,
    VALIDE: 0,
    REJETE: 0,
  };
  for (const r of rows) {
    const k = String(r._id ?? "");
    if (k in out) out[k] = r.c;
  }
  return out as Record<BancarisationRequestStatus, number>;
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
  if (
    !isWorkflowDocumentVisible({
      workflow: "BANCARISATION",
      role: input.actor.role,
      userId: input.actor._id ?? "",
      creatorId: existing.createdByUserId,
      status: existing.status,
    })
  ) {
    throw new Error("REQUEST_NOT_FOUND");
  }
  const concessionnaire = await findConcessionnaireById(existing.concessionnaireId);
  if (
    !concessionnaire ||
    concessionnaire.deletedAt ||
    !canReadConcessionnaire(input.actor, concessionnaire)
  ) {
    throw new Error("REQUEST_NOT_FOUND");
  }
  if (!BANCARISATION_PENDING_STATUSES.includes(existing.status as (typeof BANCARISATION_PENDING_STATUSES)[number])) {
    if (existing.status === "VALIDE" || existing.status === "REJETE") throw new Error("REQUEST_NOT_PENDING");
    throw new Error("REQUEST_NOT_PENDING");
  }

  const now = new Date();
  const actorRole = input.actor.role;
  if (
    !isWorkflowStageAssignedToRole({
      workflow: "BANCARISATION",
      role: actorRole,
      status: existing.status,
    })
  ) {
    throw new Error("FORBIDDEN_TRANSITION");
  }

  if (input.decision === "REJETER") {
    await col.updateOne(
      { _id: objectId },
      {
        $set: {
          status: "REJETE",
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
    await appendAuditLog({
      entityType: "CONCESSIONNAIRE",
      entityId: existing.concessionnaireId,
      action: "BANCARISATION_DECISION",
      userId: input.actor._id ?? "",
      details: {
        requestId: input.requestId,
        decision: "REJETER",
        statusAfter: "REJETE",
        nouveauStatut: existing.nouveauStatut,
      },
    });
    return mapRequest(updated);
  }

  // VALIDER — enchaînement SOUMIS → VALIDE_N1 → VALIDE_N2 → VALIDE
  let nextStatus: BancarisationRequestStatus;
  if (existing.status === "SOUMIS") {
    if (areWorkflowApprovalsEnabled() ? actorRole !== "CHEF_SECTION" : !isOperationalWorkflowRole(actorRole)) {
      throw new Error("FORBIDDEN_TRANSITION");
    }
    nextStatus = "VALIDE_N1";
  } else if (existing.status === "VALIDE_N1") {
    if (areWorkflowApprovalsEnabled() ? actorRole !== "ASSIST_CDS" : !isOperationalWorkflowRole(actorRole)) {
      throw new Error("FORBIDDEN_TRANSITION");
    }
    nextStatus = "VALIDE_N2";
  } else if (existing.status === "VALIDE_N2") {
    if (areWorkflowApprovalsEnabled() ? actorRole !== "CHEF_SERVICE" : !isOperationalWorkflowRole(actorRole)) {
      throw new Error("FORBIDDEN_TRANSITION");
    }
    nextStatus = "VALIDE";
  } else {
    throw new Error("REQUEST_NOT_PENDING");
  }

  await col.updateOne(
    { _id: objectId },
    {
      $set: {
        status: nextStatus,
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

  if (nextStatus === "VALIDE") {
    await prisma.concessionnaire.updateMany({
      where: { id: existing.concessionnaireId, deletedAt: null },
      data: {
        statutBancarisation: normalizeBancarisationStatut(existing.nouveauStatut, null),
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
      statusAfter: nextStatus,
      nouveauStatut: existing.nouveauStatut,
    },
  });

  return mapRequest(updated);
}

export async function bancarisationCountersByAgenceProduit(
  scopeAgenceId?: string,
  scopeAgenceIds?: string[],
  actor?: Pick<UserDocument, "_id" | "role">,
) {
  const requests = await listBancarisationRequests({
    page: 1,
    pageSize: 10_000,
    scopeAgenceId,
    scopeAgenceIds,
    visibility: actor,
  });
  const visibleConcessionnaireIds = [
    ...new Set(requests.items.map((request) => request.concessionnaireId)),
  ];
  if (visibleConcessionnaireIds.length === 0) return [];
  const agenceWhere = restrictionToPrismaAgenceWhere({
    agenceId: scopeAgenceId,
    agenceIds: scopeAgenceIds,
  });
  const where: Prisma.ConcessionnaireWhereInput = {
    id: { in: visibleConcessionnaireIds },
    deletedAt: null,
    ...agenceWhere,
  };
  const rows = await prisma.concessionnaire.findMany({
    where,
    select: {
      agenceId: true,
      statutBancarisation: true,
      etatRib: true,
      produitsAutorises: true,
    },
  });

  const map = new Map<
    string,
    { agenceId: string | null; produitCode: string } & Record<BancarisationStatut, number>
  >();
  for (const row of rows) {
    const produits = row.produitsAutorises.length > 0 ? row.produitsAutorises : ["SANS_PRODUIT"];
    for (const p of produits) {
      const code = p.trim().toUpperCase() || "SANS_PRODUIT";
      const key = `${row.agenceId ?? "NO_AGENCE"}::${code}`;
      if (!map.has(key)) {
        map.set(key, {
          agenceId: row.agenceId,
          produitCode: code,
          ...emptyBancarisationStatutCounts(),
        });
      }
      const item = map.get(key)!;
      incrementBancarisationStatutCount(item, row.statutBancarisation, row.etatRib);
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
