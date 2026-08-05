import "server-only";

import { ObjectId } from "mongodb";

import { canCreateConcessionnaireForAgence, userMatchesAgence } from "@/lib/lonaci/access";
import {
  normalizeClientTypeDistributeur,
  type ClientTypeDistributeur,
} from "@/lib/lonaci/client-constants";
import { restrictionToMongoAgenceFilter } from "@/lib/lonaci/list-agence-restriction";
import {
  SOUMISSION_STATUT_DEFAULT,
  type SoumissionStatut,
} from "@/lib/lonaci/soumission-constants";
import type { UserDocument } from "@/lib/lonaci/types";
import { getDatabase } from "@/lib/mongodb";

const COLLECTION = "soumissions";

interface SoumissionStored {
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

function isAppele(doc: Pick<SoumissionStored, "appele" | "paye">): boolean {
  if (typeof doc.appele === "boolean") return doc.appele;
  return Boolean(doc.paye);
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
  const doc: Omit<SoumissionStored, "_id"> = {
    nomComplet: input.nomComplet.trim(),
    contact: input.contact.trim(),
    typeDistributeur: input.typeDistributeur,
    nombreTpe: Math.max(0, Math.floor(input.nombreTpe)),
    agenceId: input.agenceId,
    produitCode,
    statut: input.statut ?? SOUMISSION_STATUT_DEFAULT,
    appele: Boolean(input.appele),
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
  const appele = Boolean(input.appele);

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
    existing.statut === input.statut &&
    isAppele(existing) === appele &&
    existing.date.getTime() === input.date.getTime() &&
    (existing.observations ?? "") === (nextObservations ?? "");

  if (same) {
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
        statut: input.statut,
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
      statut: input.statut,
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
  if (input.statut !== undefined) $set.statut = input.statut;
  if (input.appele !== undefined) $set.appele = Boolean(input.appele);
  if (input.date !== undefined) $set.date = input.date;
  if (input.observations !== undefined) {
    $set.observations = input.observations?.trim() || null;
  }

  await col.updateOne(
    { _id: row._id },
    input.appele !== undefined ? { $set, $unset: { paye: "" } } : { $set },
  );
  const updated = await col.findOne({ _id: row._id });
  if (!updated) throw new Error("SOUMISSION_NOT_FOUND");
  return toPublic(updated);
}

export async function listSoumissions(input: {
  page: number;
  pageSize: number;
  actor: UserDocument;
  agenceId?: string;
  agenceIds?: string[];
  produitCode?: string;
  statut?: SoumissionStatut;
  /** true = appelés, false = non appelés (champ absent inclus). */
  appele?: boolean;
  q?: string;
}): Promise<{
  items: SoumissionPublic[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const db = await getDatabase();
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
    filter.$or = [{ appele: true }, { paye: true }];
  } else if (input.appele === false) {
    filter.$nor = [{ appele: true }, { paye: true }];
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

  const col = db.collection<SoumissionStored>(COLLECTION);
  const skip = (input.page - 1) * input.pageSize;
  const [total, rows] = await Promise.all([
    col.countDocuments(filter),
    col.find(filter).sort({ date: -1, createdAt: -1 }).skip(skip).limit(input.pageSize).toArray(),
  ]);

  return {
    items: rows.map(toPublic),
    total,
    page: input.page,
    pageSize: input.pageSize,
  };
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
