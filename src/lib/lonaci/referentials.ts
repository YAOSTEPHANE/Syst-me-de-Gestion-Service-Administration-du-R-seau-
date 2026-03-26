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

interface CreateReferentialInput {
  code: string;
  libelle: string;
}

function normalizeCode(code: string) {
  return code.trim().toUpperCase();
}

export async function createAgence(input: CreateReferentialInput): Promise<AgenceDocument> {
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

export async function createProduit(input: CreateReferentialInput): Promise<ProduitDocument> {
  const db = await getDatabase();
  const now = new Date();
  const produit: InsertProduitDocument = {
    code: normalizeCode(input.code),
    libelle: input.libelle.trim(),
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
