import { Prisma } from "@prisma/client";

import {
  BANCARISATION_STATUT_LABELS,
  BANCARISATION_STATUTS,
  CONCESSIONNAIRE_STATUT_LABELS,
  CONCESSIONNAIRE_STATUTS,
  type BancarisationStatut,
  type ConcessionnaireStatut,
} from "@/lib/lonaci/constants";
import { appendAuditLog } from "@/lib/lonaci/audit";
import type {
  ConcessionnaireDocument,
  GpsPoint,
  PieceJointeDocument,
  UserDocument,
} from "@/lib/lonaci/types";
import {
  CONCESSIONNAIRES_MAP_POINTS_MAX,
  type ConcessionnaireMapPointDto,
  type ConcessionnairesMapPointsResponse,
} from "@/lib/lonaci/concessionnaires-map-types";
import { prisma } from "@/lib/prisma";

const COUNTER_ID = "concessionnaire_pdv";

function isObjectId(id: string) {
  return /^[a-f\d]{24}$/i.test(id);
}

function mapDoc(row: {
  id: string;
  codePdv: string;
  nomComplet: string | null;
  raisonSociale: string;
  cniNumero: string | null;
  photoUrl: string | null;
  email: string | null;
  telephonePrincipal: string | null;
  telephoneSecondaire: string | null;
  telephone: string | null;
  adresse: string | null;
  ville: string | null;
  codePostal: string | null;
  agenceId: string | null;
  produitsAutorises: string[];
  statut: string;
  statutBancarisation: string | null;
  compteBancaire: string | null;
  banqueEtablissement: string | null;
  gps: Prisma.JsonValue | null;
  piecesJointes: Prisma.JsonValue;
  observations: string | null;
  notesInternes: string | null;
  createdByUserId: string;
  updatedByUserId: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}): ConcessionnaireDocument {
  const pieces = Array.isArray(row.piecesJointes)
    ? (row.piecesJointes as unknown as PieceJointeDocument[])
    : [];
  return {
    _id: row.id,
    codePdv: row.codePdv,
    // Historique de données: `nomComplet` peut exister en `null` en base.
    // On normalise côté application vers une valeur string exploitable.
    nomComplet: row.nomComplet ?? row.raisonSociale ?? row.codePdv,
    raisonSociale: row.raisonSociale,
    cniNumero: row.cniNumero,
    photoUrl: row.photoUrl,
    email: row.email,
    telephonePrincipal: row.telephonePrincipal,
    telephoneSecondaire: row.telephoneSecondaire,
    telephone: row.telephone,
    adresse: row.adresse,
    ville: row.ville,
    codePostal: row.codePostal,
    agenceId: row.agenceId,
    produitsAutorises: row.produitsAutorises,
    statut: row.statut as ConcessionnaireStatut,
    statutBancarisation: (row.statutBancarisation ?? "NON_BANCARISE") as BancarisationStatut,
    compteBancaire: row.compteBancaire,
    banqueEtablissement: row.banqueEtablissement,
    gps: (row.gps as GpsPoint | null) ?? null,
    piecesJointes: pieces,
    observations: row.observations,
    notesInternes: row.notesInternes,
    createdByUserId: row.createdByUserId,
    updatedByUserId: row.updatedByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

export async function ensureConcessionnaireIndexes() {
  return;
}

async function nextCodePdv(agenceCode: string): Promise<string> {
  const normalizedAgenceCode = agenceCode.trim().toUpperCase();
  const counterId = `${COUNTER_ID}_${normalizedAgenceCode}`;
  await prisma.counter.upsert({
    where: { id: counterId },
    update: { seq: { increment: 1 } },
    create: { id: counterId, seq: 1 },
  });
  const doc = await prisma.counter.findUnique({ where: { id: counterId } });
  const seq = doc?.seq ?? 1;
  return `PDV-${normalizedAgenceCode}-${String(seq).padStart(6, "0")}`;
}

export interface CreateConcessionnaireInput {
  nomComplet: string;
  cniNumero: string | null;
  photoUrl: string | null;
  email: string | null;
  telephonePrincipal: string | null;
  telephoneSecondaire: string | null;
  adresse: string | null;
  ville: string | null;
  codePostal: string | null;
  agenceId: string | null;
  agenceCode: string;
  produitsAutorises: string[];
  statut?: ConcessionnaireStatut;
  statutBancarisation: BancarisationStatut;
  compteBancaire: string | null;
  banqueEtablissement: string | null;
  gps: GpsPoint | null;
  observations: string | null;
  notesInternes: string | null;
  createdByUserId: string;
}

export async function createConcessionnaire(input: CreateConcessionnaireInput): Promise<ConcessionnaireDocument> {
  const codePdv = await nextCodePdv(input.agenceCode);
  const nomComplet = input.nomComplet.trim();
  const created = await prisma.concessionnaire.create({
    data: {
      codePdv,
      nomComplet,
      raisonSociale: nomComplet,
      cniNumero: input.cniNumero,
      photoUrl: input.photoUrl,
      email: input.email,
      telephonePrincipal: input.telephonePrincipal,
      telephoneSecondaire: input.telephoneSecondaire,
      telephone: input.telephonePrincipal,
      adresse: input.adresse,
      ville: input.ville,
      codePostal: input.codePostal,
      agenceId: input.agenceId,
      produitsAutorises: input.produitsAutorises,
      statut: input.statut ?? "ACTIF",
      statutBancarisation: input.statutBancarisation,
      compteBancaire: input.compteBancaire,
      banqueEtablissement: input.banqueEtablissement,
      gps: (input.gps ?? null) as unknown as Prisma.InputJsonValue,
      piecesJointes: [],
      observations: input.observations,
      notesInternes: input.notesInternes,
      createdByUserId: input.createdByUserId,
      updatedByUserId: input.createdByUserId,
      deletedAt: null,
    },
  });
  const mapped = mapDoc(created);

  await appendAuditLog({
    entityType: "CONCESSIONNAIRE",
    entityId: mapped._id ?? "",
    action: "CREATE",
    userId: input.createdByUserId,
    details: { codePdv: mapped.codePdv, raisonSociale: mapped.raisonSociale },
  });

  return mapped;
}

export async function findConcessionnaireById(id: string): Promise<ConcessionnaireDocument | null> {
  if (!isObjectId(id)) {
    return null;
  }
  const row = await prisma.concessionnaire.findUnique({ where: { id } });
  return row ? mapDoc(row) : null;
}

export interface SearchConcessionnairesParams {
  page: number;
  pageSize: number;
  q?: string;
  statut?: ConcessionnaireStatut;
  statutBancarisation?: BancarisationStatut;
  agenceId?: string;
  produitCode?: string;
  scopeAgenceId?: string | null;
  includeDeleted: boolean;
}

/** Portée liste concessionnaires (même règle que GET /api/concessionnaires). */
export function concessionnaireListScopeAgenceId(user: {
  agenceId: string | null;
  role: string;
}): string | undefined {
  if (user.role === "CHEF_SERVICE" && user.agenceId === null) {
    return undefined;
  }
  if (user.agenceId) {
    return user.agenceId;
  }
  return undefined;
}

export type ConcessionnaireListFilterParams = Pick<
  SearchConcessionnairesParams,
  "q" | "statut" | "statutBancarisation" | "agenceId" | "produitCode" | "scopeAgenceId" | "includeDeleted"
>;

export function buildConcessionnaireListWhere(
  params: ConcessionnaireListFilterParams,
): Prisma.ConcessionnaireWhereInput {
  const filter: Prisma.ConcessionnaireWhereInput = {};

  if (!params.includeDeleted) {
    filter.deletedAt = null;
  }

  if (params.scopeAgenceId) {
    filter.agenceId = params.scopeAgenceId;
  } else if (params.agenceId) {
    filter.agenceId = params.agenceId;
  }

  if (params.statut) {
    filter.statut = params.statut;
  }
  if (params.statutBancarisation) {
    filter.statutBancarisation = params.statutBancarisation;
  }
  if (params.produitCode) {
    filter.produitsAutorises = { has: params.produitCode.trim().toUpperCase() };
  }

  if (params.q && params.q.trim().length > 0) {
    const q = params.q.trim();
    filter.OR = [
      { raisonSociale: { contains: q, mode: "insensitive" } },
      { nomComplet: { contains: q, mode: "insensitive" } },
      { codePdv: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { telephone: { contains: q, mode: "insensitive" } },
      { telephonePrincipal: { contains: q, mode: "insensitive" } },
      { telephoneSecondaire: { contains: q, mode: "insensitive" } },
      { cniNumero: { contains: q, mode: "insensitive" } },
    ];
  }

  return filter;
}

const PANEL_STATS_MAX_DETAIL_ROWS = 12_000;

function lastSixMonthBucketsUtc(): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    const key = `${y}-${String(m).padStart(2, "0")}`;
    const label = new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("fr-FR", {
      month: "short",
      year: "numeric",
    });
    out.push({ key, label });
  }
  return out;
}

export interface ConcessionnairesPanelStats {
  total: number;
  /** Si true, produits / créations mensuelles non calculés (trop de lignes). */
  detailTruncated: boolean;
  byStatut: { key: string; count: number; label: string }[];
  byBancarisation: { key: string; count: number; label: string }[];
  byAgence: { agenceId: string | null; count: number }[];
  byProduit: { code: string; count: number }[];
  creésParMois: { key: string; label: string; count: number }[];
}

export async function getConcessionnairesPanelStats(
  params: ConcessionnaireListFilterParams,
): Promise<ConcessionnairesPanelStats> {
  const where = buildConcessionnaireListWhere(params);
  const [total, byStatutRows, byBancRows, byAgenceRows] = await Promise.all([
    prisma.concessionnaire.count({ where }),
    prisma.concessionnaire.groupBy({
      by: ["statut"],
      where,
      _count: { _all: true },
    }),
    prisma.concessionnaire.groupBy({
      by: ["statutBancarisation"],
      where,
      _count: { _all: true },
    }),
    prisma.concessionnaire.groupBy({
      by: ["agenceId"],
      where,
      _count: { _all: true },
    }),
  ]);

  const statutMap = new Map(byStatutRows.map((r) => [r.statut, r._count._all]));
  const byStatut = CONCESSIONNAIRE_STATUTS.filter((k) => (statutMap.get(k) ?? 0) > 0).map((key) => ({
    key,
    count: statutMap.get(key) ?? 0,
    label: CONCESSIONNAIRE_STATUT_LABELS[key],
  }));

  const bancMap = new Map(byBancRows.map((r) => [r.statutBancarisation, r._count._all]));
  const byBancarisation = BANCARISATION_STATUTS.filter((k) => (bancMap.get(k) ?? 0) > 0).map((key) => ({
    key,
    count: bancMap.get(key) ?? 0,
    label: BANCARISATION_STATUT_LABELS[key],
  }));

  const byAgence = [...byAgenceRows]
    .map((r) => ({ agenceId: r.agenceId, count: r._count._all }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 14);

  let detailTruncated = false;
  let byProduit: { code: string; count: number }[] = [];
  const monthTemplate = lastSixMonthBucketsUtc();
  let creésParMois = monthTemplate.map((m) => ({ ...m, count: 0 }));

  if (total > PANEL_STATS_MAX_DETAIL_ROWS) {
    detailTruncated = true;
  } else if (total > 0) {
    const rows = await prisma.concessionnaire.findMany({
      where,
      select: { createdAt: true, produitsAutorises: true },
    });
    const produitCounts = new Map<string, number>();
    const monthCounts = new Map(monthTemplate.map((m) => [m.key, 0]));
    for (const row of rows) {
      for (const code of row.produitsAutorises) {
        const c = code.trim().toUpperCase();
        if (!c) continue;
        produitCounts.set(c, (produitCounts.get(c) ?? 0) + 1);
      }
      const d = row.createdAt;
      const mk = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      if (monthCounts.has(mk)) {
        monthCounts.set(mk, (monthCounts.get(mk) ?? 0) + 1);
      }
    }
    creésParMois = monthTemplate.map((m) => ({
      ...m,
      count: monthCounts.get(m.key) ?? 0,
    }));
    byProduit = [...produitCounts.entries()]
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count);
  }

  return {
    total,
    detailTruncated,
    byStatut,
    byBancarisation,
    byAgence,
    byProduit,
    creésParMois,
  };
}

function rowToMapPoint(row: {
  id: string;
  codePdv: string;
  nomComplet: string | null;
  raisonSociale: string;
  gps: Prisma.JsonValue | null;
}): ConcessionnaireMapPointDto | null {
  const g = row.gps as unknown;
  if (!g || typeof g !== "object") return null;
  const o = g as { lat?: unknown; lng?: unknown };
  if (typeof o.lat !== "number" || typeof o.lng !== "number") return null;
  if (!Number.isFinite(o.lat) || !Number.isFinite(o.lng)) return null;
  const label = (row.nomComplet || row.raisonSociale || row.codePdv).trim();
  return {
    id: row.id,
    codePdv: row.codePdv,
    label,
    lat: o.lat,
    lng: o.lng,
  };
}

/**
 * Points carte : pas de filtre Prisma sur le champ JSON `gps` (Mongo : `isSet` / `not: JsonNull`
 * peuvent provoquer des erreurs moteur). On pagine sur le jeu filtré et on ne garde que les GPS valides.
 */
export async function getConcessionnairesMapPoints(
  params: ConcessionnaireListFilterParams,
): Promise<ConcessionnairesMapPointsResponse> {
  const where = buildConcessionnaireListWhere(params);
  const MAX = CONCESSIONNAIRES_MAP_POINTS_MAX;
  const BATCH = 400;
  /** Limite de lignes lues pour éviter un parcours infini sur très gros référentiels. */
  const MAX_ROWS_SCANNED = 80_000;

  const points: ConcessionnaireMapPointDto[] = [];
  let totalWithGps = 0;
  let skip = 0;
  let rowsScanned = 0;
  let truncated = false;

  for (;;) {
    if (rowsScanned >= MAX_ROWS_SCANNED) {
      truncated = true;
      break;
    }

    const batch = await prisma.concessionnaire.findMany({
      where,
      select: {
        id: true,
        codePdv: true,
        nomComplet: true,
        raisonSociale: true,
        gps: true,
      },
      orderBy: { updatedAt: "desc" },
      skip,
      take: BATCH,
    });

    if (batch.length === 0) {
      break;
    }

    rowsScanned += batch.length;

    for (const row of batch) {
      const p = rowToMapPoint(row);
      if (!p) continue;
      totalWithGps++;
      if (points.length < MAX) {
        points.push(p);
      }
    }

    skip += BATCH;

    if (batch.length < BATCH) {
      break;
    }
  }

  if (totalWithGps > MAX) {
    truncated = true;
  }

  return { points, totalWithGps, truncated };
}

export async function searchConcessionnaires(params: SearchConcessionnairesParams): Promise<{
  items: ConcessionnaireDocument[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const filter = buildConcessionnaireListWhere(params);

  const skip = (params.page - 1) * params.pageSize;
  const [total, rows] = await Promise.all([
    prisma.concessionnaire.count({ where: filter }),
    prisma.concessionnaire.findMany({
      where: filter,
      orderBy: { updatedAt: "desc" },
      skip,
      take: params.pageSize,
    }),
  ]);

  return {
    items: rows.map(mapDoc),
    total,
    page: params.page,
    pageSize: params.pageSize,
  };
}

export interface UpdateConcessionnaireInput {
  nomComplet?: string;
  cniNumero?: string | null;
  photoUrl?: string | null;
  email?: string | null;
  telephonePrincipal?: string | null;
  telephoneSecondaire?: string | null;
  adresse?: string | null;
  ville?: string | null;
  codePostal?: string | null;
  agenceId?: string | null;
  produitsAutorises?: string[];
  statut?: ConcessionnaireStatut;
  statutBancarisation?: BancarisationStatut;
  compteBancaire?: string | null;
  banqueEtablissement?: string | null;
  gps?: GpsPoint | null;
  observations?: string | null;
  notesInternes?: string | null;
}

export async function updateConcessionnaire(
  id: string,
  patch: UpdateConcessionnaireInput,
  user: UserDocument,
): Promise<ConcessionnaireDocument | null> {
  if (!isObjectId(id)) {
    return null;
  }

  const data: Prisma.ConcessionnaireUpdateInput = {
    updatedByUserId: user._id ?? "",
    updatedAt: new Date(),
  };
  for (const key of Object.keys(patch) as (keyof UpdateConcessionnaireInput)[]) {
    const v = patch[key];
    if (v === undefined) continue;
    if (key === "gps") {
      data.gps = (v ?? null) as Prisma.InputJsonValue;
    } else if (key === "nomComplet" && typeof v === "string") {
      const trimmed = v.trim();
      data.nomComplet = trimmed;
      data.raisonSociale = trimmed;
    } else if (key === "telephonePrincipal") {
      const tel = (v as string | null) ?? null;
      data.telephonePrincipal = tel;
      data.telephone = tel;
    } else {
      // @ts-expect-error mapped dynamic keys
      data[key] = v;
    }
  }

  const updateResult = await prisma.concessionnaire.updateMany({
    where: { id, deletedAt: null },
    data,
  });

  if (updateResult.count === 0) {
    return null;
  }

  const updated = await prisma.concessionnaire.findUnique({ where: { id } });
  if (!updated) {
    return null;
  }

  const mapped = mapDoc(updated);
  await appendAuditLog({
    entityType: "CONCESSIONNAIRE",
    entityId: id,
    action: "UPDATE",
    userId: user._id ?? "",
    details: { fields: Object.keys(patch) },
  });

  return mapped;
}

export async function softDeleteConcessionnaire(id: string, user: UserDocument): Promise<boolean> {
  if (!isObjectId(id)) {
    return false;
  }
  const now = new Date();
  const result = await prisma.concessionnaire.updateMany({
    where: { id, deletedAt: null },
    data: {
      statut: "INACTIF",
      updatedAt: now,
      updatedByUserId: user._id ?? "",
    },
  });
  if (result.count === 0) {
    return false;
  }

  await appendAuditLog({
    entityType: "CONCESSIONNAIRE",
    entityId: id,
    action: "DEACTIVATE",
    userId: user._id ?? "",
    details: { statut: "INACTIF" },
  });

  return true;
}

export function sanitizeConcessionnairePublic(doc: ConcessionnaireDocument) {
  return {
    id: doc._id ?? "",
    codePdv: doc.codePdv,
    raisonSociale: doc.raisonSociale,
    nomComplet: doc.nomComplet,
    cniNumero: doc.cniNumero,
    photoUrl: doc.photoUrl,
    email: doc.email,
    telephonePrincipal: doc.telephonePrincipal,
    telephoneSecondaire: doc.telephoneSecondaire,
    telephone: doc.telephone,
    adresse: doc.adresse,
    ville: doc.ville,
    codePostal: doc.codePostal,
    agenceId: doc.agenceId,
    produitsAutorises: doc.produitsAutorises,
    statut: doc.statut,
    statutBancarisation: doc.statutBancarisation,
    compteBancaire: doc.compteBancaire,
    banqueEtablissement: doc.banqueEtablissement,
    gps: doc.gps,
    piecesJointes: doc.piecesJointes.map((p) => ({
      id: p.id,
      kind: p.kind,
      filename: p.filename,
      mimeType: p.mimeType,
      size: p.size,
      uploadedAt: p.uploadedAt.toISOString(),
      uploadedByUserId: p.uploadedByUserId,
    })),
    notesInternes: doc.notesInternes,
    observations: doc.observations,
    createdByUserId: doc.createdByUserId,
    updatedByUserId: doc.updatedByUserId,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
    deletedAt: doc.deletedAt ? doc.deletedAt.toISOString() : null,
  };
}

export function sanitizeConcessionnaireListItem(doc: ConcessionnaireDocument) {
  return {
    id: doc._id ?? "",
    codePdv: doc.codePdv,
    nomComplet: doc.nomComplet,
    raisonSociale: doc.raisonSociale,
    photoUrl: doc.photoUrl,
    cniNumero: doc.cniNumero,
    telephonePrincipal: doc.telephonePrincipal,
    telephoneSecondaire: doc.telephoneSecondaire,
    telephone: doc.telephone,
    agenceId: doc.agenceId,
    produitsAutorises: doc.produitsAutorises,
    statut: doc.statut,
    statutBancarisation: doc.statutBancarisation,
    compteBancaire: doc.compteBancaire,
    banqueEtablissement: doc.banqueEtablissement,
    ville: doc.ville,
    gps: doc.gps,
    observations: doc.observations,
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export async function addPieceJointe(
  concessionnaireId: string,
  piece: PieceJointeDocument,
  user: UserDocument,
): Promise<ConcessionnaireDocument | null> {
  if (!isObjectId(concessionnaireId)) {
    return null;
  }
  const existing = await prisma.concessionnaire.findUnique({ where: { id: concessionnaireId } });
  if (!existing || existing.deletedAt) return null;
  const pieces = Array.isArray(existing.piecesJointes)
    ? (existing.piecesJointes as unknown as PieceJointeDocument[])
    : [];
  const updateResult = await prisma.concessionnaire.updateMany({
    where: { id: concessionnaireId, deletedAt: null },
    data: {
      piecesJointes: [...pieces, piece] as unknown as Prisma.InputJsonValue,
      updatedAt: new Date(),
      updatedByUserId: user._id ?? "",
    },
  });
  if (updateResult.count === 0) {
    return null;
  }
  const updated = await prisma.concessionnaire.findUnique({ where: { id: concessionnaireId } });
  if (!updated) {
    return null;
  }

  await appendAuditLog({
    entityType: "CONCESSIONNAIRE",
    entityId: concessionnaireId,
    action: "PIECE_ADD",
    userId: user._id ?? "",
    details: { pieceId: piece.id, kind: piece.kind, filename: piece.filename },
  });

  return mapDoc(updated);
}

export async function removePieceJointe(
  concessionnaireId: string,
  pieceId: string,
  user: UserDocument,
): Promise<{ doc: ConcessionnaireDocument | null; removed: PieceJointeDocument | null }> {
  if (!isObjectId(concessionnaireId)) {
    return { doc: null, removed: null };
  }
  const existing = await prisma.concessionnaire.findUnique({ where: { id: concessionnaireId } });
  if (!existing) {
    return { doc: null, removed: null };
  }
  const pieces = Array.isArray(existing.piecesJointes)
    ? (existing.piecesJointes as unknown as PieceJointeDocument[])
    : [];
  const removed = pieces.find((p) => p.id === pieceId) ?? null;
  if (!removed) {
    return { doc: mapDoc(existing), removed: null };
  }

  const nextPieces = pieces.filter((p) => p.id !== pieceId);
  const updateResult = await prisma.concessionnaire.updateMany({
    where: { id: concessionnaireId, deletedAt: null },
    data: {
      piecesJointes: nextPieces as unknown as Prisma.InputJsonValue,
      updatedAt: new Date(),
      updatedByUserId: user._id ?? "",
    },
  });

  if (updateResult.count === 0) {
    return { doc: null, removed };
  }

  const updated = await prisma.concessionnaire.findUnique({ where: { id: concessionnaireId } });
  if (!updated) {
    return { doc: null, removed };
  }

  await appendAuditLog({
    entityType: "CONCESSIONNAIRE",
    entityId: concessionnaireId,
    action: "PIECE_REMOVE",
    userId: user._id ?? "",
    details: { pieceId, filename: removed.filename },
  });

  return { doc: mapDoc(updated), removed };
}
