import { ObjectId } from "mongodb";

import { getDatabase } from "@/lib/mongodb";
import type { AgenceDocument, ProduitDocument } from "@/lib/lonaci/types";

const AGENCES_COLLECTION = "agences";
const PRODUITS_COLLECTION = "produits";

type StoredAgenceDocument = Omit<AgenceDocument, "_id"> & { _id: ObjectId };
type StoredProduitDocument = Omit<ProduitDocument, "_id"> & { _id: ObjectId };
type InsertAgenceDocument = Omit<StoredAgenceDocument, "_id">;
type InsertProduitDocument = Omit<StoredProduitDocument, "_id">;

function mapStoredAgence(item: StoredAgenceDocument): AgenceDocument {
  return {
    ...item,
    _id: item._id.toHexString(),
  };
}

function mapStoredProduit(item: StoredProduitDocument): ProduitDocument {
  return {
    ...item,
    _id: item._id.toHexString(),
  };
}

export async function ensureReferentialsIndexes() {
  const db = await getDatabase();

  await db.collection<StoredAgenceDocument>(AGENCES_COLLECTION).createIndexes([
    { key: { code: 1 }, unique: true, name: "uniq_code" },
    { key: { actif: 1 }, name: "idx_actif" },
  ]);
  await db.collection<StoredProduitDocument>(PRODUITS_COLLECTION).createIndexes([
    { key: { code: 1 }, unique: true, name: "uniq_code" },
    { key: { actif: 1 }, name: "idx_actif" },
  ]);
}

interface CreateAgenceInput {
  code: string;
  libelle: string;
}

interface CreateProduitInput {
  code: string;
  libelle: string;
  /** Prix caution (FCFA), entier ≥ 0. */
  prix: number;
}

function normalizeCode(code: string) {
  return code.trim().toUpperCase();
}

export async function createAgence(input: CreateAgenceInput): Promise<AgenceDocument> {
  const db = await getDatabase();
  const now = new Date();
  const agence: InsertAgenceDocument = {
    code: normalizeCode(input.code),
    libelle: input.libelle.trim(),
    actif: true,
    createdAt: now,
    updatedAt: now,
  };

  const result = await db.collection<InsertAgenceDocument>(AGENCES_COLLECTION).insertOne(agence);
  return { ...agence, _id: result.insertedId.toHexString() };
}

export async function createProduit(input: CreateProduitInput): Promise<ProduitDocument> {
  const db = await getDatabase();
  const now = new Date();
  const prix = Number.isFinite(input.prix) ? Math.max(0, Math.round(input.prix)) : 0;
  const produit: InsertProduitDocument = {
    code: normalizeCode(input.code),
    libelle: input.libelle.trim(),
    prix,
    actif: true,
    createdAt: now,
    updatedAt: now,
  };

  const result = await db.collection<InsertProduitDocument>(PRODUITS_COLLECTION).insertOne(produit);
  return { ...produit, _id: result.insertedId.toHexString() };
}

export async function listAgences(): Promise<AgenceDocument[]> {
  const db = await getDatabase();
  const rows = await db
    .collection<StoredAgenceDocument>(AGENCES_COLLECTION)
    .find({})
    .sort({ code: 1 })
    .toArray();
  return rows.map(mapStoredAgence);
}

export async function listProduits(): Promise<ProduitDocument[]> {
  const db = await getDatabase();
  const rows = await db
    .collection<StoredProduitDocument>(PRODUITS_COLLECTION)
    .find({})
    .sort({ code: 1 })
    .toArray();
  return rows.map(mapStoredProduit);
}

export async function findAgenceById(id: string): Promise<AgenceDocument | null> {
  if (!ObjectId.isValid(id)) {
    return null;
  }
  const db = await getDatabase();
  const row = await db.collection<StoredAgenceDocument>(AGENCES_COLLECTION).findOne({ _id: new ObjectId(id) });
  return row ? mapStoredAgence(row) : null;
}

export async function findProduitByCode(code: string): Promise<ProduitDocument | null> {
  const normalized = normalizeCode(code);
  const db = await getDatabase();
  const row = await db
    .collection<StoredProduitDocument>(PRODUITS_COLLECTION)
    .findOne({ code: normalized, actif: true });
  return row ? mapStoredProduit(row) : null;
}

export async function findProduitById(id: string): Promise<ProduitDocument | null> {
  if (!ObjectId.isValid(id)) {
    return null;
  }
  const db = await getDatabase();
  const row = await db
    .collection<StoredProduitDocument>(PRODUITS_COLLECTION)
    .findOne({ _id: new ObjectId(id) });
  return row ? mapStoredProduit(row) : null;
}

export interface UpdateProduitInput {
  libelle?: string;
  prix?: number;
  actif?: boolean;
  code?: string;
}

/**
 * Met à jour un produit par identifiant Mongo. Lance `Error("DUPLICATE_CODE")` si le code entre en conflit d'unicité.
 */
export async function updateProduit(id: string, input: UpdateProduitInput): Promise<ProduitDocument | null> {
  if (!ObjectId.isValid(id)) {
    return null;
  }
  const db = await getDatabase();
  const oid = new ObjectId(id);
  const existing = await db.collection<StoredProduitDocument>(PRODUITS_COLLECTION).findOne({ _id: oid });
  if (!existing) {
    return null;
  }

  const $set: Record<string, unknown> = { updatedAt: new Date() };
  if (input.libelle !== undefined) {
    $set.libelle = input.libelle.trim();
  }
  if (input.prix !== undefined) {
    $set.prix = Number.isFinite(input.prix) ? Math.max(0, Math.round(input.prix)) : 0;
  }
  if (input.actif !== undefined) {
    $set.actif = input.actif;
  }
  if (input.code !== undefined) {
    $set.code = normalizeCode(input.code);
  }

  try {
    const result = await db.collection<StoredProduitDocument>(PRODUITS_COLLECTION).updateOne({ _id: oid }, { $set });
    if (result.matchedCount === 0) {
      return null;
    }
    const row = await db.collection<StoredProduitDocument>(PRODUITS_COLLECTION).findOne({ _id: oid });
    return row ? mapStoredProduit(row) : null;
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: number }).code === 11000
    ) {
      throw new Error("DUPLICATE_CODE");
    }
    throw error;
  }
}

export async function deleteProduitById(id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) {
    return false;
  }
  const db = await getDatabase();
  const result = await db.collection<StoredProduitDocument>(PRODUITS_COLLECTION).deleteOne({ _id: new ObjectId(id) });
  return result.deletedCount === 1;
}
