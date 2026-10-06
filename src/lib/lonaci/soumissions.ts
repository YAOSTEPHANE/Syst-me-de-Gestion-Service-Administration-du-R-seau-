import "server-only";

import { ObjectId } from "mongodb";

import { canCreateConcessionnaireForAgence, userMatchesAgence } from "@/lib/lonaci/access";
import {
  normalizeClientTypeDistributeur,
  type ClientTypeDistributeur,
} from "@/lib/lonaci/client-constants";
import type { CautionEncaissementMode } from "@/lib/lonaci/constants";
import { restrictionToMongoAgenceFilter } from "@/lib/lonaci/list-agence-restriction";
import {
  isSoumissionCircuitClos,
  isSoumissionCircuitStatut,
  resolveSoumissionCircuitActions,
  SOUMISSION_CIRCUIT_OUVERTS,
  SOUMISSION_CIRCUIT_VALIDES,
  soumissionCurrentMonthStart,
  soumissionOverdueThreshold,
  type SoumissionCircuitActions,
  type SoumissionCircuitCounters,
  type SoumissionCircuitStatut,
  type SoumissionCircuitTab,
} from "@/lib/lonaci/soumission-circuit";
import {
  harmonizeSoumissionAppel,
  soumissionStatutImpliqueAppel,
  SOUMISSION_STATUT_DEFAULT,
  type SoumissionStatut,
} from "@/lib/lonaci/soumission-constants";
import {
  buildSoumissionStats,
  soumissionStatsWindowEnd,
  soumissionStatsWindowStart,
  type SoumissionStatsPayload,
} from "@/lib/lonaci/soumission-stats";
import type { UserDocument } from "@/lib/lonaci/types";
import { areWorkflowApprovalsEnabled } from "@/lib/lonaci/workflow-approvals";
import { getDatabase } from "@/lib/mongodb";

export const SOUMISSIONS_COLLECTION = "soumissions";
const COLLECTION = SOUMISSIONS_COLLECTION;

export type SoumissionCircuitHistoryEntry = {
  action: string;
  comment: string | null;
  actedAt: Date;
  actedByUserId: string;
  actedByName: string;
};

export interface SoumissionStored {
  _id: ObjectId;
  nomComplet: string;
  contact: string;
  typeDistributeur: ClientTypeDistributeur;
  nombreTpe: number;
  agenceId: string;
  /** Code produit LONACI (ex. LOTO). Obligatoire pour les nouveaux docs. */
  produitCode: string;
  statut: SoumissionStatut;
  /** Contact déjà appelé (indépendant du statut pipeline). */
  appele: boolean;
  /** @deprecated Ancien champ ; lu en fallback pour docs existants. */
  paye?: boolean;
  fichePaiementGeneratedAt: Date | null;
  fichePaiementGeneratedByUserId: string | null;
  fichePaiementGeneratedByName: string | null;
  /** Absent / null : circuit non démarré (aucune fiche caisse émise). */
  circuitStatut?: SoumissionCircuitStatut | null;
  circuitStartedAt?: Date | null;
  circuitFinalizedAt?: Date | null;
  circuitFinalizedByName?: string | null;
  /** Dernier motif de correction, d'annulation ou d'exonération. */
  circuitMotif?: string | null;
  circuitHistory?: SoumissionCircuitHistoryEntry[];
  paymentMode?: CautionEncaissementMode | null;
  paymentReference?: string | null;
  numeroFicheDefinitive?: string | null;
  ficheDefinitiveEmiseLe?: Date | null;
  j10AlertSentAt?: Date | null;
  date: Date;
  observations: string | null;
  createdByUserId: string;
  updatedByUserId: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export type SoumissionPublic = {
  id: string;
  nomComplet: string;
  contact: string;
  typeDistributeur: ClientTypeDistributeur;
  nombreTpe: number;
  agenceId: string;
  produitCode: string;
  statut: SoumissionStatut;
  appele: boolean;
  fichePaiementGeneratedAt: string | null;
  fichePaiementGeneratedByName: string | null;
  circuitStatut: SoumissionCircuitStatut | null;
  circuitStartedAt: string | null;
  circuitFinalizedAt: string | null;
  circuitFinalizedByName: string | null;
  circuitMotif: string | null;
  paymentMode: CautionEncaissementMode | null;
  paymentReference: string | null;
  numeroFicheDefinitive: string | null;
  ficheDefinitiveEmiseLe: string | null;
  /** Présent dans les listes : actions autorisées pour l'utilisateur courant. */
  circuitActions?: SoumissionCircuitActions;
  date: string;
  observations: string | null;
  createdByUserId: string;
  updatedByUserId: string;
  createdAt: string;
  updatedAt: string;
};

function normalizeProduitCode(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase();
}

function isAppele(doc: Pick<SoumissionStored, "appele" | "paye" | "statut">): boolean {
  if (soumissionStatutImpliqueAppel(doc.statut)) return true;
  if (typeof doc.appele === "boolean") return doc.appele;
  return Boolean(doc.paye);
}

function isoOrNull(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function circuitStatutOf(doc: Pick<SoumissionStored, "circuitStatut">): SoumissionCircuitStatut | null {
  return isSoumissionCircuitStatut(doc.circuitStatut) ? doc.circuitStatut : null;
}

export function soumissionToPublic(doc: SoumissionStored): SoumissionPublic {
  return toPublic(doc);
}

export function canAccessSoumissionRow(row: SoumissionStored, actor: UserDocument): boolean {
  return canAccessSoumission(row, actor);
}

function toPublic(doc: SoumissionStored): SoumissionPublic {
  return {
    id: doc._id.toHexString(),
    nomComplet: doc.nomComplet,
    contact: doc.contact,
    typeDistributeur: doc.typeDistributeur,
    nombreTpe: doc.nombreTpe,
    agenceId: doc.agenceId,
    produitCode: normalizeProduitCode(doc.produitCode),
    statut: doc.statut,
    appele: isAppele(doc),
    fichePaiementGeneratedAt: doc.fichePaiementGeneratedAt
      ? doc.fichePaiementGeneratedAt.toISOString()
      : null,
    fichePaiementGeneratedByName: doc.fichePaiementGeneratedByName ?? null,
    circuitStatut: circuitStatutOf(doc),
    circuitStartedAt: isoOrNull(doc.circuitStartedAt),
    circuitFinalizedAt: isoOrNull(doc.circuitFinalizedAt),
    circuitFinalizedByName: doc.circuitFinalizedByName ?? null,
    circuitMotif: doc.circuitMotif ?? null,
    paymentMode: doc.paymentMode ?? null,
    paymentReference: doc.paymentReference ?? null,
    numeroFicheDefinitive: doc.numeroFicheDefinitive ?? null,
    ficheDefinitiveEmiseLe: isoOrNull(doc.ficheDefinitiveEmiseLe),
    date: doc.date.toISOString(),
    observations: doc.observations,
    createdByUserId: doc.createdByUserId,
    updatedByUserId: doc.updatedByUserId,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function ensureSoumissionsIndexes() {
  const db = await getDatabase();
  await db.collection<SoumissionStored>(COLLECTION).createIndexes([
    { key: { agenceId: 1, produitCode: 1, statut: 1, date: -1 }, name: "idx_agence_produit_statut_date" },
    { key: { produitCode: 1, date: -1 }, name: "idx_produit_date" },
    { key: { agenceId: 1, statut: 1, date: -1 }, name: "idx_agence_statut_date" },
    { key: { statut: 1, updatedAt: -1 }, name: "idx_statut_updated" },
    { key: { appele: 1, date: -1 }, name: "idx_appele_date" },
    { key: { date: -1 }, name: "idx_date" },
    { key: { createdAt: -1 }, name: "idx_created" },
    { key: { contact: 1, agenceId: 1, produitCode: 1 }, name: "idx_contact_agence_produit" },
    { key: { contact: 1, agenceId: 1 }, name: "idx_contact_agence" },
    { key: { nomComplet: 1, contact: 1 }, name: "idx_nom_contact" },
    { key: { circuitStatut: 1, circuitStartedAt: 1 }, name: "idx_circuit_started" },
    { key: { circuitStatut: 1, circuitFinalizedAt: -1 }, name: "idx_circuit_finalized" },
  ]);
}

function canAccessSoumission(row: SoumissionStored, actor: UserDocument): boolean {
  return Boolean(actor._id) && userMatchesAgence(actor, row.agenceId);
}

export async function createSoumission(input: {
  nomComplet: string;
  contact: string;
  typeDistributeur: ClientTypeDistributeur;
  nombreTpe: number;
  agenceId: string;
  produitCode: string;
  statut?: SoumissionStatut;
  appele?: boolean;
  date: Date;
  observations: string | null;
  actorId: string;
}): Promise<SoumissionPublic> {
  const produitCode = normalizeProduitCode(input.produitCode);
  if (!produitCode) throw new Error("PRODUIT_REQUIRED");

  const db = await getDatabase();
  const now = new Date();
  const appel = harmonizeSoumissionAppel(null, {
    statut: input.statut ?? SOUMISSION_STATUT_DEFAULT,
    appele: Boolean(input.appele),
  });
  const doc: Omit<SoumissionStored, "_id"> = {
    nomComplet: input.nomComplet.trim(),
    contact: input.contact.trim(),
    typeDistributeur: input.typeDistributeur,
    nombreTpe: Math.max(0, Math.floor(input.nombreTpe)),
    agenceId: input.agenceId,
    produitCode,
    statut: appel.statut,
    appele: appel.appele,
    fichePaiementGeneratedAt: null,
    fichePaiementGeneratedByUserId: null,
    fichePaiementGeneratedByName: null,
    date: input.date,
    observations: input.observations?.trim() || null,
    createdByUserId: input.actorId,
    updatedByUserId: input.actorId,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  const result = await db.collection(COLLECTION).insertOne(doc);
  return toPublic({ ...doc, _id: result.insertedId });
}

/**
 * Upsert import : clé contact+agence+produit, sinon nomComplet+contact+produit.
 */
export async function upsertSoumissionFromImport(input: {
  nomComplet: string;
  contact: string;
  typeDistributeur: ClientTypeDistributeur;
  nombreTpe: number;
  agenceId: string;
  produitCode: string;
  statut: SoumissionStatut;
  appele?: boolean;
  date: Date;
  observations: string | null;
  actorId: string;
}): Promise<{ item: SoumissionPublic; outcome: "inserted" | "updated" | "unchanged" }> {
  const db = await getDatabase();
  const contact = input.contact.trim();
  const nomComplet = input.nomComplet.trim();
  const produitCode = normalizeProduitCode(input.produitCode);
  if (!produitCode) throw new Error("PRODUIT_REQUIRED");
  const col = db.collection<SoumissionStored>(COLLECTION);
  const { statut, appele } = harmonizeSoumissionAppel(null, {
    statut: input.statut,
    appele: Boolean(input.appele),
  });

  let existing =
    contact && input.agenceId
      ? await col.findOne({
          deletedAt: null,
          contact,
          agenceId: input.agenceId,
          produitCode,
        })
      : null;

  if (!existing && nomComplet && contact) {
    existing = await col.findOne({
      deletedAt: null,
      nomComplet,
      contact,
      produitCode,
    });
  }

  if (!existing) {
    const created = await createSoumission({
      ...input,
      nomComplet,
      contact,
      produitCode,
      statut,
      appele,
    });
    return { item: created, outcome: "inserted" };
  }

  const nextObservations = input.observations?.trim() || null;
  const same =
    existing.nomComplet === nomComplet &&
    existing.contact === contact &&
    existing.typeDistributeur === input.typeDistributeur &&
    existing.nombreTpe === input.nombreTpe &&
    existing.agenceId === input.agenceId &&
    normalizeProduitCode(existing.produitCode) === produitCode &&
    existing.statut === statut &&
    isAppele(existing) === appele &&
    existing.date.getTime() === input.date.getTime() &&
    (existing.observations ?? "") === (nextObservations ?? "");

  if (same || isSoumissionCircuitClos(circuitStatutOf(existing))) {
    return { item: toPublic(existing), outcome: "unchanged" };
  }

  const now = new Date();
  await col.updateOne(
    { _id: existing._id },
    {
      $set: {
        nomComplet,
        contact,
        typeDistributeur: input.typeDistributeur,
        nombreTpe: Math.max(0, Math.floor(input.nombreTpe)),
        agenceId: input.agenceId,
        produitCode,
        statut,
        appele,
        date: input.date,
        observations: nextObservations,
        updatedAt: now,
        updatedByUserId: input.actorId,
      },
      $unset: { paye: "" },
    },
  );

  return {
    item: toPublic({
      ...existing,
      nomComplet,
      contact,
      typeDistributeur: input.typeDistributeur,
      nombreTpe: Math.max(0, Math.floor(input.nombreTpe)),
      agenceId: input.agenceId,
      produitCode,
      statut,
      appele,
      date: input.date,
      observations: nextObservations,
      updatedAt: now,
      updatedByUserId: input.actorId,
    }),
    outcome: "updated",
  };
}

export async function findSoumissionById(
  id: string,
  actor: UserDocument,
): Promise<SoumissionPublic | null> {
  if (!ObjectId.isValid(id)) return null;
  const db = await getDatabase();
  const row = await db
    .collection<SoumissionStored>(COLLECTION)
    .findOne({ _id: new ObjectId(id), deletedAt: null });
  if (!row || !canAccessSoumission(row, actor)) return null;
  return toPublic(row);
}

export async function updateSoumission(input: {
  id: string;
  actor: UserDocument;
  nomComplet?: string;
  contact?: string;
  typeDistributeur?: ClientTypeDistributeur;
  nombreTpe?: number;
  agenceId?: string;
  produitCode?: string;
  statut?: SoumissionStatut;
  appele?: boolean;
  date?: Date;
  observations?: string | null;
}): Promise<SoumissionPublic> {
  if (!ObjectId.isValid(input.id)) throw new Error("SOUMISSION_NOT_FOUND");
  const db = await getDatabase();
  const col = db.collection<SoumissionStored>(COLLECTION);
  const row = await col.findOne({ _id: new ObjectId(input.id), deletedAt: null });
  if (!row || !canAccessSoumission(row, input.actor)) throw new Error("SOUMISSION_NOT_FOUND");

  const touchesMoreThanAppele = (
    ["nomComplet", "contact", "typeDistributeur", "nombreTpe", "agenceId", "produitCode", "statut", "date", "observations"] as const
  ).some((key) => input[key] !== undefined);
  if (touchesMoreThanAppele && isSoumissionCircuitClos(circuitStatutOf(row))) {
    throw new Error("SOUMISSION_IMMUTABLE");
  }

  const nextAgenceId = input.agenceId ?? row.agenceId;
  if (!canCreateConcessionnaireForAgence(input.actor, nextAgenceId)) {
    throw new Error("AGENCE_FORBIDDEN");
  }

  const $set: Record<string, unknown> = {
    updatedAt: new Date(),
    updatedByUserId: input.actor._id ?? "",
  };
  if (input.nomComplet !== undefined) $set.nomComplet = input.nomComplet.trim();
  if (input.contact !== undefined) $set.contact = input.contact.trim();
  if (input.typeDistributeur !== undefined) {
    const td = normalizeClientTypeDistributeur(input.typeDistributeur);
    if (!td) throw new Error("TYPE_DISTRIBUTEUR_INVALID");
    $set.typeDistributeur = td;
  }
  if (input.nombreTpe !== undefined) $set.nombreTpe = Math.max(0, Math.floor(input.nombreTpe));
  if (input.agenceId !== undefined) $set.agenceId = input.agenceId;
  if (input.produitCode !== undefined) {
    const produitCode = normalizeProduitCode(input.produitCode);
    if (!produitCode) throw new Error("PRODUIT_REQUIRED");
    $set.produitCode = produitCode;
  }
  const touchesAppel = input.statut !== undefined || input.appele !== undefined;
  if (touchesAppel) {
    const appel = harmonizeSoumissionAppel(
      { statut: row.statut, appele: isAppele(row) },
      { statut: input.statut, appele: input.appele },
    );
    $set.statut = appel.statut;
    $set.appele = appel.appele;
  }
  if (input.date !== undefined) $set.date = input.date;
  if (input.observations !== undefined) {
    $set.observations = input.observations?.trim() || null;
  }

  await col.updateOne(
    { _id: row._id },
    touchesAppel ? { $set, $unset: { paye: "" } } : { $set },
  );
  const updated = await col.findOne({ _id: row._id });
  if (!updated) throw new Error("SOUMISSION_NOT_FOUND");
  return toPublic(updated);
}

type SoumissionsFilterInput = {
  agenceId?: string;
  agenceIds?: string[];
  produitCode?: string;
  statut?: SoumissionStatut;
  /** true = appelés, false = non appelés (champ absent inclus). */
  appele?: boolean;
  q?: string;
};

function buildSoumissionsFilter(input: SoumissionsFilterInput): Record<string, unknown> {
  const filter: Record<string, unknown> = { deletedAt: null };
  const agenceMongo = restrictionToMongoAgenceFilter({
    agenceId: input.agenceId,
    agenceIds: input.agenceIds,
  });
  if (agenceMongo) filter.agenceId = agenceMongo;
  const produitCode = normalizeProduitCode(input.produitCode);
  if (produitCode) filter.produitCode = produitCode;
  if (input.statut) filter.statut = input.statut;
  if (input.appele === true) {
    filter.$or = [{ appele: true }, { paye: true }, { statut: { $ne: "A_APPELER" } }];
  } else if (input.appele === false) {
    filter.$nor = [{ appele: true }, { paye: true }, { statut: { $ne: "A_APPELER" } }];
  }

  const q = input.q?.trim();
  if (q) {
    const rx = { $regex: escapeRegex(q), $options: "i" };
    const textOr = [
      { nomComplet: rx },
      { contact: rx },
      { observations: rx },
      { produitCode: rx },
    ];
    if (filter.$or || filter.$nor) {
      const paymentClause: Record<string, unknown> = {};
      if (filter.$or) {
        paymentClause.$or = filter.$or;
        delete filter.$or;
      }
      if (filter.$nor) {
        paymentClause.$nor = filter.$nor;
        delete filter.$nor;
      }
      filter.$and = [paymentClause, { $or: textOr }];
    } else {
      filter.$or = textOr;
    }
  }
  return filter;
}

function circuitTabFilter(tab: SoumissionCircuitTab, now: Date): Record<string, unknown> {
  switch (tab) {
    case "TOUTES":
      return {};
    case "J10_OVERDUE":
      return {
        circuitStatut: { $in: [...SOUMISSION_CIRCUIT_OUVERTS] },
        circuitStartedAt: { $lte: soumissionOverdueThreshold(now) },
      };
    case "EN_ATTENTE":
      return {
        circuitStatut: { $in: [...SOUMISSION_CIRCUIT_OUVERTS] },
        circuitStartedAt: { $gt: soumissionOverdueThreshold(now) },
      };
    case "VALIDATED_THIS_MONTH":
      return {
        circuitStatut: { $in: [...SOUMISSION_CIRCUIT_VALIDES] },
        circuitFinalizedAt: { $gte: soumissionCurrentMonthStart(now) },
      };
    default: {
      const exhaustive: never = tab;
      return exhaustive;
    }
  }
}

export async function listSoumissions(
  input: SoumissionsFilterInput & {
    page: number;
    pageSize: number;
    actor: UserDocument;
    circuitTab?: SoumissionCircuitTab;
  },
): Promise<{
  items: SoumissionPublic[];
  total: number;
  page: number;
  pageSize: number;
  circuitCounters: SoumissionCircuitCounters;
}> {
  const db = await getDatabase();
  const now = new Date();
  const baseFilter = buildSoumissionsFilter(input);
  const filter = { ...baseFilter, ...circuitTabFilter(input.circuitTab ?? "TOUTES", now) };
  const col = db.collection<SoumissionStored>(COLLECTION);
  const skip = (input.page - 1) * input.pageSize;
  const countTab = (tab: Exclude<SoumissionCircuitTab, "TOUTES">) =>
    col.countDocuments({ ...baseFilter, ...circuitTabFilter(tab, now) });
  const [total, rows, overdue, enAttente, validees] = await Promise.all([
    col.countDocuments(filter),
    col.find(filter).sort({ date: -1, createdAt: -1 }).skip(skip).limit(input.pageSize).toArray(),
    countTab("J10_OVERDUE"),
    countTab("EN_ATTENTE"),
    countTab("VALIDATED_THIS_MONTH"),
  ]);

  const approvalsEnabled = areWorkflowApprovalsEnabled();
  return {
    items: rows.map((row) => ({
      ...toPublic(row),
      circuitActions: resolveSoumissionCircuitActions({
        role: input.actor.role,
        circuitStatut: circuitStatutOf(row),
        approvalsEnabled,
      }),
    })),
    total,
    page: input.page,
    pageSize: input.pageSize,
    circuitCounters: {
      J10_OVERDUE: overdue,
      EN_ATTENTE: enAttente,
      VALIDATED_THIS_MONTH: validees,
    },
  };
}

/** Volumes de soumissions par jour / semaine / mois (sur le champ `date`), mêmes filtres que la liste. */
export async function getSoumissionStats(
  input: SoumissionsFilterInput & { now?: Date },
): Promise<SoumissionStatsPayload> {
  const now = input.now ?? new Date();
  const db = await getDatabase();
  const filter = buildSoumissionsFilter(input);
  filter.date = { $gte: soumissionStatsWindowStart(now), $lt: soumissionStatsWindowEnd(now) };

  const rows = await db
    .collection<SoumissionStored>(COLLECTION)
    .aggregate<{ _id: string; count: number }>([
      { $match: filter },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$date", timezone: "UTC" } },
          count: { $sum: 1 },
        },
      },
    ])
    .toArray();

  const dailyCounts: Record<string, number> = {};
  for (const row of rows) dailyCounts[row._id] = row.count;
  return buildSoumissionStats(dailyCounts, now);
}

/** Enregistre l’émission de la fiche paiement caisse (agent générateur). */
export async function markSoumissionFichePaiementGenerated(input: {
  id: string;
  actor: UserDocument;
  agentName: string;
}): Promise<SoumissionPublic> {
  if (!ObjectId.isValid(input.id)) throw new Error("SOUMISSION_NOT_FOUND");
  const db = await getDatabase();
  const col = db.collection<SoumissionStored>(COLLECTION);
  const row = await col.findOne({ _id: new ObjectId(input.id), deletedAt: null });
  if (!row || !canAccessSoumission(row, input.actor)) throw new Error("SOUMISSION_NOT_FOUND");
  if (isSoumissionCircuitClos(circuitStatutOf(row))) throw new Error("SOUMISSION_CIRCUIT_CLOS");

  const now = new Date();
  const agentName = input.agentName.trim() || "Agent LONACI";
  await col.updateOne(
    { _id: row._id },
    {
      $set: {
        fichePaiementGeneratedAt: now,
        fichePaiementGeneratedByUserId: input.actor._id ?? "",
        fichePaiementGeneratedByName: agentName,
        updatedAt: now,
        updatedByUserId: input.actor._id ?? "",
      },
    },
  );
  const updated = await col.findOne({ _id: row._id });
  if (!updated) throw new Error("SOUMISSION_NOT_FOUND");
  return toPublic(updated);
}
