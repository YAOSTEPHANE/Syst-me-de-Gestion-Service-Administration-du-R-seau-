import type { Prisma } from "@prisma/client";

import type { ContratDocument, ContratOperationType, UserDocument } from "@/lib/lonaci/types";
import { appendAuditLog } from "@/lib/lonaci/audit";
import { prisma } from "@/lib/prisma";
import { findConcessionnaireById } from "@/lib/lonaci/concessionnaires";

const REF_COUNTER_ID = "contrat_ref";

function mapContrat(row: {
  id: string;
  reference: string;
  concessionnaireId: string;
  produitCode: string;
  operationType: string;
  status: string;
  dateEffet: Date;
  dossierId: string;
  createdByUserId: string;
  updatedByUserId: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}): ContratDocument {
  return {
    _id: row.id,
    reference: row.reference,
    concessionnaireId: row.concessionnaireId,
    produitCode: row.produitCode,
    operationType: row.operationType as ContratOperationType,
    status: row.status as "ACTIF" | "RESILIE" | "CEDE",
    dateEffet: row.dateEffet,
    dossierId: row.dossierId,
    createdByUserId: row.createdByUserId,
    updatedByUserId: row.updatedByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

/**
 * Numérotation automatique à la finalisation du dossier :
 * `CONTRAT-[PRODUIT]-[ANNÉE]-[MOIS]-[SÉQUENCE]` — PRODUIT normalisé (majuscules, espaces → _),
 * mois sur 2 chiffres, séquence sur 4 chiffres ; compteur remis à zéro chaque mois et par produit.
 */
async function nextContratReference(produitCode: string, dateEffet: Date) {
  const y = dateEffet.getFullYear();
  const m = String(dateEffet.getMonth() + 1).padStart(2, "0");
  const normalizedProduit = produitCode.trim().toUpperCase().replace(/\s+/g, "_");
  const counterId = `${REF_COUNTER_ID}_${normalizedProduit}_${y}${m}`;
  await prisma.counter.upsert({
    where: { id: counterId },
    update: { seq: { increment: 1 } },
    create: { id: counterId, seq: 1 },
  });
  const counter = await prisma.counter.findUnique({ where: { id: counterId } });
  const seq = counter?.seq ?? 1;
  return `CONTRAT-${normalizedProduit}-${y}-${m}-${String(seq).padStart(4, "0")}`;
}

/**
 * Prochaine référence probable (sans incrémenter le compteur) — pour affichage dans les formulaires.
 * Format : CONTRAT-[PRODUIT]-[ANNÉE]-[MOIS]-[SÉQUENCE] (séquence sur 4 chiffres).
 */
export async function previewNextContratReference(produitCode: string, dateEffet: Date): Promise<string> {
  const y = dateEffet.getFullYear();
  const m = String(dateEffet.getMonth() + 1).padStart(2, "0");
  const normalizedProduit = produitCode.trim().toUpperCase().replace(/\s+/g, "_");
  const counterId = `${REF_COUNTER_ID}_${normalizedProduit}_${y}${m}`;
  const counter = await prisma.counter.findUnique({ where: { id: counterId } });
  const nextSeq = (counter?.seq ?? 0) + 1;
  return `CONTRAT-${normalizedProduit}-${y}-${m}-${String(nextSeq).padStart(4, "0")}`;
}

export async function ensureContratIndexes() {
  return;
}

export async function hasActiveContractForProduct(
  concessionnaireId: string,
  produitCode: string,
): Promise<boolean> {
  const count = await prisma.contrat.count({
    where: {
      concessionnaireId,
      produitCode,
      status: "ACTIF",
      deletedAt: null,
    },
  });
  return count > 0;
}

export async function findActiveContratIdForProduct(input: {
  concessionnaireId: string;
  produitCode: string;
}): Promise<string | null> {
  const row = await prisma.contrat.findFirst({
    where: {
      concessionnaireId: input.concessionnaireId,
      produitCode: input.produitCode.trim().toUpperCase(),
      status: "ACTIF",
      deletedAt: null,
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  return row?.id ?? null;
}

export async function markActiveContratAsCedeForProduct(input: {
  concessionnaireId: string;
  produitCode: string;
  actor: UserDocument;
  cessionId: string;
  cessionReference: string;
}) {
  const contratId = await findActiveContratIdForProduct({
    concessionnaireId: input.concessionnaireId,
    produitCode: input.produitCode,
  });
  if (!contratId) throw new Error("CONTRAT_SOURCE_NOT_FOUND");

  const now = new Date();
  await prisma.contrat.update({
    where: { id: contratId },
    data: {
      status: "CEDE",
      updatedAt: now,
      updatedByUserId: input.actor._id ?? "",
    },
  });

  await appendAuditLog({
    entityType: "CONTRAT",
    entityId: contratId,
    action: "CEDE_FROM_CESSION",
    userId: input.actor._id ?? "",
    details: {
      cessionId: input.cessionId,
      cessionReference: input.cessionReference,
      concessionnaireId: input.concessionnaireId,
      produitCode: input.produitCode.trim().toUpperCase(),
    },
  });
}

export interface FinalizeContratInput {
  dossierId: string;
  concessionnaireId: string;
  produitCode: string;
  operationType: ContratOperationType;
  dateEffet: Date;
  actor: UserDocument;
}

export async function finalizeContratFromDossier(input: FinalizeContratInput): Promise<ContratDocument> {
  const concessionnaire = await findConcessionnaireById(input.concessionnaireId);
  if (!concessionnaire || concessionnaire.deletedAt || concessionnaire.statut !== "ACTIF") {
    throw new Error("CONCESSIONNAIRE_BLOQUE");
  }

  const produitCodeNormalized = input.produitCode.trim().toUpperCase();

  // Règles métier :
  // - NOUVEAU : refuser si un contrat ACTIF existe déjà.
  // - ACTUALISATION : résilier les contrats ACTIF existants avant de créer le nouveau.
  if (input.operationType === "NOUVEAU") {
    const exists = await hasActiveContractForProduct(input.concessionnaireId, produitCodeNormalized);
    if (exists) throw new Error("ACTIVE_CONTRACT_EXISTS");
  } else if (input.operationType === "ACTUALISATION") {
    const active = await prisma.contrat.findMany({
      where: {
        concessionnaireId: input.concessionnaireId,
        produitCode: produitCodeNormalized,
        status: "ACTIF",
        deletedAt: null,
      },
      select: { id: true },
    });

    if (active.length > 0) {
      const now = new Date();
      await Promise.all(
        active.map((c) =>
          prisma.contrat.update({
            where: { id: c.id },
            data: {
              status: "RESILIE",
              updatedAt: now,
              updatedByUserId: input.actor._id ?? "",
            },
          }),
        ),
      );

      await Promise.all(
        active.map((c) =>
          appendAuditLog({
            entityType: "CONTRAT",
            entityId: c.id,
            action: "RESILIE_FROM_ACTUALISATION",
            userId: input.actor._id ?? "",
            details: { produitCode: produitCodeNormalized, concessionnaireId: input.concessionnaireId },
          }),
        ),
      );
    }
  }

  const reference = await nextContratReference(produitCodeNormalized, input.dateEffet);
  const created = await prisma.contrat.create({
    data: {
      reference,
      concessionnaireId: input.concessionnaireId,
      produitCode: produitCodeNormalized,
      operationType: input.operationType,
      status: "ACTIF",
      dateEffet: input.dateEffet,
      dossierId: input.dossierId,
      createdByUserId: input.actor._id ?? "",
      updatedByUserId: input.actor._id ?? "",
      deletedAt: null,
    },
  });

  await appendAuditLog({
    entityType: "CONTRAT",
    entityId: created.id,
    action: "FINALIZE_FROM_DOSSIER",
    userId: input.actor._id ?? "",
    details: {
      dossierId: input.dossierId,
      concessionnaireId: input.concessionnaireId,
      produitCode: created.produitCode,
      operationType: created.operationType,
    },
  });

  return mapContrat(created);
}

export async function findContratById(id: string): Promise<ContratDocument | null> {
  const row = await prisma.contrat.findFirst({
    where: { id, deletedAt: null },
  });
  return row ? mapContrat(row) : null;
}

export type ContratListRow = {
  id: string;
  reference: string;
  concessionnaireId: string;
  produitCode: string;
  operationType: string;
  status: string;
  dateEffet: string;
  dossierId: string;
  createdAt: string;
  updatedAt: string;
};

export type ListContratsParams = {
  page: number;
  pageSize: number;
  concessionnaireId?: string;
  produitCode?: string;
  status?: "ACTIF" | "RESILIE" | "CEDE";
  /** Filtre libre sur la référence (contient, insensible à la casse). */
  referenceContains?: string;
  /**
   * Si défini : uniquement ces concessionnaires (périmètre agence).
   * Tableau vide : aucun contrat ne correspond.
   */
  allowedConcessionnaireIds?: string[] | null;
  /** PDV rattachés à cette agence (via Prisma concessionnaires). */
  agenceId?: string;
  /** Filtre sur date d’effet du contrat (inclusif). */
  dateEffetFrom?: Date;
  dateEffetTo?: Date;
  /** Limiter aux dossiers dont l’_id Mongo est dans cette liste (workflow). */
  dossierIdsAllowlist?: string[] | null;
};

function mapPrismaContratToListRow(item: {
  id: string;
  reference: string;
  concessionnaireId: string;
  produitCode: string;
  operationType: string;
  status: string;
  dateEffet: Date;
  dossierId: string;
  createdAt: Date;
  updatedAt: Date;
}): ContratListRow {
  return {
    id: item.id,
    reference: item.reference,
    concessionnaireId: item.concessionnaireId,
    produitCode: item.produitCode,
    operationType: item.operationType,
    status: item.status,
    dateEffet: item.dateEffet.toISOString(),
    dossierId: item.dossierId,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

export async function listContrats(params: ListContratsParams) {
  const { page, pageSize } = params;
  if (params.allowedConcessionnaireIds !== null && params.allowedConcessionnaireIds !== undefined) {
    if (params.allowedConcessionnaireIds.length === 0) {
      return { items: [] as ContratListRow[], total: 0, page, pageSize };
    }
  }
  if (params.dossierIdsAllowlist !== null && params.dossierIdsAllowlist !== undefined) {
    if (params.dossierIdsAllowlist.length === 0) {
      return { items: [] as ContratListRow[], total: 0, page, pageSize };
    }
  }

  const where: Prisma.ContratWhereInput = { deletedAt: null };

  if (params.dossierIdsAllowlist != null) {
    where.dossierId = { in: params.dossierIdsAllowlist };
  }

  if (params.allowedConcessionnaireIds != null) {
    const allowed = params.allowedConcessionnaireIds;
    if (params.concessionnaireId) {
      if (!allowed.includes(params.concessionnaireId)) {
        return { items: [] as ContratListRow[], total: 0, page, pageSize };
      }
      where.concessionnaireId = params.concessionnaireId;
    } else {
      where.concessionnaireId = { in: allowed };
    }
  } else if (params.concessionnaireId) {
    where.concessionnaireId = params.concessionnaireId;
  }

  const agenceId = params.agenceId?.trim();
  if (agenceId) {
    const pdvRows = await prisma.concessionnaire.findMany({
      where: { deletedAt: null, agenceId },
      select: { id: true },
    });
    const inAgence = pdvRows.map((p) => p.id);
    if (inAgence.length === 0) {
      return { items: [] as ContratListRow[], total: 0, page, pageSize };
    }
    const cur = where.concessionnaireId;
    if (typeof cur === "string") {
      if (!inAgence.includes(cur)) {
        return { items: [] as ContratListRow[], total: 0, page, pageSize };
      }
    } else if (cur && typeof cur === "object" && "in" in cur && Array.isArray((cur as { in: string[] }).in)) {
      const inter = (cur as { in: string[] }).in.filter((id) => inAgence.includes(id));
      if (inter.length === 0) {
        return { items: [] as ContratListRow[], total: 0, page, pageSize };
      }
      where.concessionnaireId = { in: inter };
    } else {
      where.concessionnaireId = { in: inAgence };
    }
  }

  if (params.produitCode?.trim()) {
    where.produitCode = params.produitCode.trim().toUpperCase();
  }
  if (params.status) {
    where.status = params.status;
  }
  const q = params.referenceContains?.trim();
  if (q) {
    where.reference = { contains: q, mode: "insensitive" };
  }

  if (params.dateEffetFrom || params.dateEffetTo) {
    where.dateEffet = {};
    if (params.dateEffetFrom) {
      where.dateEffet.gte = params.dateEffetFrom;
    }
    if (params.dateEffetTo) {
      where.dateEffet.lte = params.dateEffetTo;
    }
  }

  const skip = (page - 1) * pageSize;
  const [total, rows] = await Promise.all([
    prisma.contrat.count({ where }),
    prisma.contrat.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
  ]);

  return {
    items: rows.map(mapPrismaContratToListRow),
    total,
    page,
    pageSize,
  };
}
