import type { Prisma } from "@prisma/client";

import type { ContratDocument, ContratOperationType, UserDocument } from "@/lib/lonaci/types";
import { appendAuditLog } from "@/lib/lonaci/audit";
import { prisma } from "@/lib/prisma";
import { findConcessionnaireById } from "@/lib/lonaci/concessionnaires";
import { findLonaciClientById } from "@/lib/lonaci/clients";
import type { ContratPartyRef } from "@/lib/lonaci/dossier-contrat-party";
import { assertConcessionnaireOperationnel, canReadConcessionnaire, isStatutFicheGelee } from "@/lib/lonaci/access";
import { updateConcessionnaire } from "@/lib/lonaci/concessionnaires";

const REF_COUNTER_ID = "contrat_ref";

function mapContrat(row: {
  id: string;
  reference: string;
  concessionnaireId: string | null;
  lonaciClientId: string | null;
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
    lonaciClientId: row.lonaciClientId,
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

export async function hasActiveContractForLonaciClient(
  lonaciClientId: string,
  produitCode: string,
): Promise<boolean> {
  const count = await prisma.contrat.count({
    where: {
      lonaciClientId,
      produitCode: produitCode.trim().toUpperCase(),
      status: "ACTIF",
      deletedAt: null,
    },
  });
  return count > 0;
}

export async function hasActiveContractForParty(
  party: ContratPartyRef,
  produitCode: string,
): Promise<boolean> {
  const pcode = produitCode.trim().toUpperCase();
  if (party.kind === "client") {
    return hasActiveContractForLonaciClient(party.lonaciClientId, pcode);
  }
  return hasActiveContractForProduct(party.concessionnaireId, pcode);
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

/** Archive le contrat ACTIF du produit (statut RESILIE, jamais deletedAt — audit trail). */
export async function markActiveContratAsResilieForProduct(input: {
  concessionnaireId: string;
  produitCode: string;
  actor: UserDocument;
  resiliationId: string;
}): Promise<{ contratId: string; contratReference: string }> {
  const contrat = await prisma.contrat.findFirst({
    where: {
      concessionnaireId: input.concessionnaireId,
      produitCode: input.produitCode.trim().toUpperCase(),
      status: "ACTIF",
      deletedAt: null,
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, reference: true },
  });
  if (!contrat) throw new Error("ACTIVE_CONTRAT_REQUIRED");

  const now = new Date();
  await prisma.contrat.update({
    where: { id: contrat.id },
    data: {
      status: "RESILIE",
      updatedAt: now,
      updatedByUserId: input.actor._id ?? "",
    },
  });

  await appendAuditLog({
    entityType: "CONTRAT",
    entityId: contrat.id,
    action: "CONTRAT_RESILIE_ARCHIVE",
    userId: input.actor._id ?? "",
    details: {
      resiliationId: input.resiliationId,
      concessionnaireId: input.concessionnaireId,
      produitCode: input.produitCode.trim().toUpperCase(),
      contratReference: contrat.reference,
      archived: true,
      deleted: false,
    },
  });

  return { contratId: contrat.id, contratReference: contrat.reference };
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
  concessionnaireId?: string | null;
  lonaciClientId?: string | null;
  produitCode: string;
  operationType: ContratOperationType;
  dateEffet: Date;
  actor: UserDocument;
}

export async function finalizeContratFromDossier(input: FinalizeContratInput): Promise<ContratDocument> {
  const lonaciClientId = input.lonaciClientId?.trim() || null;
  const concessionnaireId = input.concessionnaireId?.trim() || null;
  if (!lonaciClientId && !concessionnaireId) {
    throw new Error("PARTY_REQUIRED");
  }

  const produitCodeNormalized = input.produitCode.trim().toUpperCase();
  const party: ContratPartyRef = lonaciClientId
    ? { kind: "client", lonaciClientId }
    : { kind: "concessionnaire", concessionnaireId: concessionnaireId! };

  if (party.kind === "concessionnaire") {
    const concessionnaire = await findConcessionnaireById(party.concessionnaireId);
    if (!concessionnaire || concessionnaire.deletedAt || isStatutFicheGelee(concessionnaire.statut)) {
      throw new Error("CONCESSIONNAIRE_BLOQUE");
    }
    assertConcessionnaireOperationnel(concessionnaire);
  } else {
    const client = await findLonaciClientById(party.lonaciClientId);
    if (!client) {
      throw new Error("CLIENT_NOT_FOUND");
    }
  }

  // Règles métier :
  // - NOUVEAU : refuser si un contrat ACTIF existe déjà.
  // - ACTUALISATION : résilier les contrats ACTIF existants avant de créer le nouveau.
  if (input.operationType === "NOUVEAU") {
    const exists = await hasActiveContractForParty(party, produitCodeNormalized);
    if (exists) throw new Error("ACTIVE_CONTRACT_EXISTS");
  } else if (input.operationType === "ACTUALISATION") {
    const activeWhere =
      party.kind === "client"
        ? {
            lonaciClientId: party.lonaciClientId,
            produitCode: produitCodeNormalized,
            status: "ACTIF" as const,
            deletedAt: null,
          }
        : {
            concessionnaireId: party.concessionnaireId,
            produitCode: produitCodeNormalized,
            status: "ACTIF" as const,
            deletedAt: null,
          };
    const active = await prisma.contrat.findMany({
      where: activeWhere,
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
            details: {
              produitCode: produitCodeNormalized,
              concessionnaireId: concessionnaireId ?? undefined,
              lonaciClientId: lonaciClientId ?? undefined,
            },
          }),
        ),
      );
    }
  }

  const reference = await nextContratReference(produitCodeNormalized, input.dateEffet);
  const created = await prisma.contrat.create({
    data: {
      reference,
      concessionnaireId,
      lonaciClientId,
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
      concessionnaireId: concessionnaireId ?? undefined,
      lonaciClientId: lonaciClientId ?? undefined,
      produitCode: created.produitCode,
      operationType: created.operationType,
    },
  });

  if (party.kind === "concessionnaire") {
    const concessionnaire = await findConcessionnaireById(party.concessionnaireId);
    if (concessionnaire && concessionnaire.statut !== "ACTIF") {
      await updateConcessionnaire(party.concessionnaireId, { statut: "ACTIF" }, input.actor);
      await appendAuditLog({
        entityType: "CONCESSIONNAIRE",
        entityId: party.concessionnaireId,
        action: "ACTIVATE_FROM_CONTRAT_FINALIZE",
        userId: input.actor._id ?? "",
        details: { dossierId: input.dossierId, contratId: created.id },
      });
    }
  }

  return mapContrat(created);
}

export async function findContratById(id: string): Promise<ContratDocument | null> {
  const row = await prisma.contrat.findFirst({
    where: { id, deletedAt: null },
  });
  return row ? mapContrat(row) : null;
}

export async function findContratByDossierId(dossierId: string): Promise<ContratDocument | null> {
  const row = await prisma.contrat.findFirst({
    where: { dossierId, deletedAt: null },
  });
  return row ? mapContrat(row) : null;
}

export async function updateContratDateEffet(input: {
  contratId: string;
  dateEffet: Date;
  actor: UserDocument;
}): Promise<ContratDocument> {
  const current = await prisma.contrat.findFirst({
    where: { id: input.contratId, deletedAt: null },
  });
  if (!current) {
    throw new Error("CONTRAT_NOT_FOUND");
  }

  const concessionnaire = await findConcessionnaireById(current.concessionnaireId);
  if (!concessionnaire || concessionnaire.deletedAt || !canReadConcessionnaire(input.actor, concessionnaire)) {
    throw new Error("AGENCE_FORBIDDEN");
  }

  const updated = await prisma.contrat.update({
    where: { id: input.contratId },
    data: {
      dateEffet: input.dateEffet,
      updatedByUserId: input.actor._id ?? "",
      updatedAt: new Date(),
    },
  });

  await appendAuditLog({
    entityType: "CONTRAT",
    entityId: updated.id,
    action: "UPDATE_DATE_EFFET",
    userId: input.actor._id ?? "",
    details: {
      previousDateEffet: current.dateEffet.toISOString(),
      nextDateEffet: updated.dateEffet.toISOString(),
    },
  });

  return mapContrat(updated);
}

export async function updateContratById(input: {
  contratId: string;
  actor: UserDocument;
  dateEffet?: Date;
  status?: "ACTIF" | "RESILIE" | "CEDE";
  operationType?: ContratOperationType;
}): Promise<ContratDocument> {
  const current = await prisma.contrat.findFirst({
    where: { id: input.contratId, deletedAt: null },
  });
  if (!current) {
    throw new Error("CONTRAT_NOT_FOUND");
  }

  const concessionnaire = await findConcessionnaireById(current.concessionnaireId);
  if (!concessionnaire || concessionnaire.deletedAt || !canReadConcessionnaire(input.actor, concessionnaire)) {
    throw new Error("AGENCE_FORBIDDEN");
  }

  const nextStatus = input.status ?? (current.status as "ACTIF" | "RESILIE" | "CEDE");
  if (nextStatus === "ACTIF") {
    const activeCount = await prisma.contrat.count({
      where: {
        concessionnaireId: current.concessionnaireId,
        produitCode: current.produitCode,
        status: "ACTIF",
        deletedAt: null,
        id: { not: current.id },
      },
    });
    if (activeCount > 0) {
      throw new Error("ACTIVE_CONTRACT_EXISTS");
    }
  }

  const updated = await prisma.contrat.update({
    where: { id: input.contratId },
    data: {
      dateEffet: input.dateEffet ?? current.dateEffet,
      status: nextStatus,
      operationType: input.operationType ?? (current.operationType as ContratOperationType),
      updatedByUserId: input.actor._id ?? "",
      updatedAt: new Date(),
    },
  });

  await appendAuditLog({
    entityType: "CONTRAT",
    entityId: updated.id,
    action: "UPDATE_CONTRAT",
    userId: input.actor._id ?? "",
    details: {
      previous: {
        dateEffet: current.dateEffet.toISOString(),
        status: current.status,
        operationType: current.operationType,
      },
      next: {
        dateEffet: updated.dateEffet.toISOString(),
        status: updated.status,
        operationType: updated.operationType,
      },
    },
  });

  return mapContrat(updated);
}

export type ContratListRow = {
  id: string;
  reference: string;
  concessionnaireId: string | null;
  lonaciClientId: string | null;
  produitCode: string;
  operationType: string;
  status: string;
  dateEffet: string;
  dossierId: string;
  createdAt: string;
  updatedAt: string;
};

/** Vue nationale (chef de service sans agence) vs périmètre agence fixé — aligné export CSV contrats. */
export function listScopeAgenceIdForContratsList(user: { agenceId: string | null; role: string }): string | undefined {
  if (user.role === "CHEF_SERVICE" && user.agenceId === null) {
    return undefined;
  }
  if (user.agenceId) return user.agenceId;
  return undefined;
}

export type ListContratsParams = {
  page: number;
  pageSize: number;
  concessionnaireId?: string;
  lonaciClientId?: string;
  produitCode?: string;
  status?: "ACTIF" | "RESILIE" | "CEDE";
  /** Filtre libre sur la référence (contient, insensible à la casse). */
  referenceContains?: string;
  /**
   * Si défini : uniquement ces concessionnaires (périmètre agence legacy PDV).
   */
  allowedConcessionnaireIds?: string[] | null;
  /** Si défini : uniquement ces clients Lonaci (périmètre agence). */
  allowedLonaciClientIds?: string[] | null;
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
  concessionnaireId: string | null;
  lonaciClientId: string | null;
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
    lonaciClientId: item.lonaciClientId,
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
  if (params.dossierIdsAllowlist !== null && params.dossierIdsAllowlist !== undefined) {
    if (params.dossierIdsAllowlist.length === 0) {
      return { items: [] as ContratListRow[], total: 0, page, pageSize };
    }
  }

  const where: Prisma.ContratWhereInput = { deletedAt: null };

  if (params.dossierIdsAllowlist != null) {
    where.dossierId = { in: params.dossierIdsAllowlist };
  }

  const scopeOr: Prisma.ContratWhereInput[] = [];
  const allowedPdv = params.allowedConcessionnaireIds;
  const allowedClients = params.allowedLonaciClientIds;
  if (allowedPdv != null || allowedClients != null) {
    const pdvIds = allowedPdv ?? [];
    const clientIds = allowedClients ?? [];
    if (pdvIds.length === 0 && clientIds.length === 0) {
      return { items: [] as ContratListRow[], total: 0, page, pageSize };
    }
    if (pdvIds.length > 0) {
      scopeOr.push({ concessionnaireId: { in: pdvIds } });
    }
    if (clientIds.length > 0) {
      scopeOr.push({ lonaciClientId: { in: clientIds } });
    }
    if (scopeOr.length === 1) {
      Object.assign(where, scopeOr[0]);
    } else if (scopeOr.length > 1) {
      where.OR = scopeOr;
    }
  }

  if (params.lonaciClientId?.trim()) {
    const lid = params.lonaciClientId.trim();
    if (allowedClients != null && !allowedClients.includes(lid)) {
      return { items: [] as ContratListRow[], total: 0, page, pageSize };
    }
    where.lonaciClientId = lid;
    delete where.OR;
    delete where.concessionnaireId;
  } else if (params.concessionnaireId?.trim()) {
    const cid = params.concessionnaireId.trim();
    if (allowedPdv != null && !allowedPdv.includes(cid)) {
      return { items: [] as ContratListRow[], total: 0, page, pageSize };
    }
    where.concessionnaireId = cid;
    delete where.OR;
    delete where.lonaciClientId;
  }

  const agenceId = params.agenceId?.trim();
  if (agenceId && allowedPdv == null && allowedClients == null) {
    const [pdvRows, clientRows] = await Promise.all([
      prisma.concessionnaire.findMany({
        where: { deletedAt: null, agenceId },
        select: { id: true },
      }),
      prisma.lonaciClient.findMany({
        where: { deletedAt: null, agenceId },
        select: { id: true },
      }),
    ]);
    const inAgencePdv = pdvRows.map((p) => p.id);
    const inAgenceClients = clientRows.map((c) => c.id);
    if (inAgencePdv.length === 0 && inAgenceClients.length === 0) {
      return { items: [] as ContratListRow[], total: 0, page, pageSize };
    }
    const agenceOr: Prisma.ContratWhereInput[] = [];
    if (inAgencePdv.length > 0) {
      agenceOr.push({ concessionnaireId: { in: inAgencePdv } });
    }
    if (inAgenceClients.length > 0) {
      agenceOr.push({ lonaciClientId: { in: inAgenceClients } });
    }
    if (agenceOr.length === 1) {
      Object.assign(where, agenceOr[0]);
    } else {
      where.OR = agenceOr;
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

export const CONTRATS_ATTENDUS_CAUTIONS_MAX = 4000;

/** Tous les contrats correspondant aux filtres (pagination interne), plafonnés pour les synthèses lourdes. */
export async function listContratsAllMatching(
  base: Omit<ListContratsParams, "page" | "pageSize">,
): Promise<ContratListRow[]> {
  const out: ContratListRow[] = [];
  let page = 1;
  const pageSize = 500;
  for (;;) {
    const { items, total } = await listContrats({ ...base, page, pageSize });
    out.push(...items);
    if (items.length < pageSize || out.length >= total || out.length >= CONTRATS_ATTENDUS_CAUTIONS_MAX) break;
    page += 1;
  }
  return out.slice(0, CONTRATS_ATTENDUS_CAUTIONS_MAX);
}
