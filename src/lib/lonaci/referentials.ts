import { ObjectId } from "mongodb";

import { getDatabase } from "@/lib/mongodb";
import { prisma } from "@/lib/prisma";
import type { AgenceDocument, AgenceZoneGeographique, ProduitDocument } from "@/lib/lonaci/types";
import { coalesceZoneGeographique } from "@/lib/lonaci/zones-abidjan";

const AGENCES_COLLECTION = "agences";
const PRODUITS_COLLECTION = "produits";
const DOSSIERS_COLLECTION = "dossiers";
const SUCCESSION_CASES_COLLECTION = "succession_cases";
const PDV_INTEGRATIONS_COLLECTION = "pdv_integrations";
const LONACI_REGISTRIES_COLLECTION = "lonaci_registries";

/** Compteurs de liens métier empêchant la suppression d’une agence. */
export type AgenceDeleteBlockers = {
  concessionnaires: number;
  utilisateurs: number;
  demandesBancarisation: number;
  dossiers: number;
  successions: number;
  integrationsPdv: number;
  registresLonaci: number;
};

export async function countAgenceReferences(agenceId: string): Promise<AgenceDeleteBlockers> {
  const id = agenceId.trim();
  const db = await getDatabase();
  const [
    concessionnaires,
    utilisateurs,
    demandesBancarisation,
    dossiers,
    successions,
    integrationsPdv,
    registresLonaci,
  ] = await Promise.all([
    prisma.concessionnaire.count({ where: { agenceId: id, deletedAt: null } }),
    prisma.user.count({
      where: {
        deletedAt: null,
        OR: [{ agenceId: id }, { agencesAutorisees: { has: id } }],
      },
    }),
    prisma.bancarisationRequest.count({ where: { agenceId: id } }),
    db.collection(DOSSIERS_COLLECTION).countDocuments({ agenceId: id, deletedAt: null }),
    db.collection(SUCCESSION_CASES_COLLECTION).countDocuments({ agenceId: id, deletedAt: null }),
    db.collection(PDV_INTEGRATIONS_COLLECTION).countDocuments({ agenceId: id, deletedAt: null }),
    db.collection(LONACI_REGISTRIES_COLLECTION).countDocuments({ agenceId: id, deletedAt: null }),
  ]);
  return {
    concessionnaires,
    utilisateurs,
    demandesBancarisation,
    dossiers,
    successions,
    integrationsPdv,
    registresLonaci,
  };
}

export function formatAgenceDeleteBlockedMessage(blockers: AgenceDeleteBlockers): string {
  const parts: string[] = [];
  if (blockers.concessionnaires > 0) parts.push(`${blockers.concessionnaires} concessionnaire(s)`);
  if (blockers.utilisateurs > 0) parts.push(`${blockers.utilisateurs} utilisateur(s)`);
  if (blockers.demandesBancarisation > 0) parts.push(`${blockers.demandesBancarisation} demande(s) bancarisation`);
  if (blockers.dossiers > 0) parts.push(`${blockers.dossiers} dossier(s)`);
  if (blockers.successions > 0) parts.push(`${blockers.successions} succession(s)`);
  if (blockers.integrationsPdv > 0) parts.push(`${blockers.integrationsPdv} intégration(s) PDV`);
  if (blockers.registresLonaci > 0) parts.push(`${blockers.registresLonaci} registre(s) Lonaci`);
  if (parts.length === 0) return "Cette agence est encore référencée.";
  return `Impossible de supprimer : ${parts.join(", ")}. Réaffectez ou supprimez ces liens d’abord.`;
}

export type DeleteAgenceResult =
  | { ok: true }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "in_use"; blockers: AgenceDeleteBlockers };

/**
 * Supprime une agence si aucun lien actif (PDV, utilisateurs, dossiers, etc.).
 */
export async function deleteAgence(id: string): Promise<DeleteAgenceResult> {
  if (!ObjectId.isValid(id)) {
    return { ok: false, reason: "not_found" };
  }
  const oid = new ObjectId(id);
  const db = await getDatabase();
  const col = db.collection<StoredAgenceDocument>(AGENCES_COLLECTION);
  const existing = await col.findOne({ _id: oid });
  if (!existing) {
    return { ok: false, reason: "not_found" };
  }
  const blockers = await countAgenceReferences(id);
  const total = Object.values(blockers).reduce((sum, n) => sum + n, 0);
  if (total > 0) {
    return { ok: false, reason: "in_use", blockers };
  }
  const r = await col.deleteOne({ _id: oid });
  if (r.deletedCount === 0) {
    return { ok: false, reason: "not_found" };
  }
  return { ok: true };
}

/** Document Mongo : `zoneGeographique` peut être absent sur les anciennes agences. */
type StoredAgenceDocument = Omit<AgenceDocument, "_id" | "zoneGeographique"> & {
  _id: ObjectId;
  zoneGeographique?: AgenceZoneGeographique;
};
type StoredProduitDocument = Omit<ProduitDocument, "_id"> & { _id: ObjectId };
type InsertAgenceDocument = Omit<StoredAgenceDocument, "_id" | "zoneGeographique"> & {
  zoneGeographique: AgenceZoneGeographique;
};
type InsertProduitDocument = Omit<StoredProduitDocument, "_id">;

function mapStoredAgence(item: StoredAgenceDocument): AgenceDocument {
  const zoneGeographique = coalesceZoneGeographique(
    item.zoneGeographique as string | undefined,
    item.code,
    item.libelle,
  );
  return {
    ...item,
    _id: item._id.toHexString(),
    zoneGeographique,
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
  zoneGeographique: AgenceZoneGeographique;
  /** Défaut : `true` si omis. */
  actif?: boolean;
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
    zoneGeographique: input.zoneGeographique,
    actif: input.actif ?? true,
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

export interface UpdateAgenceInput {
  code: string;
  libelle: string;
  zoneGeographique: AgenceZoneGeographique;
  actif: boolean;
}

/**
 * Met à jour code, libellé, zone et statut actif/inactif. Les liens métier utilisent l’`_id` Mongo, pas le code.
 */
export async function updateAgence(id: string, input: UpdateAgenceInput): Promise<AgenceDocument | null> {
  if (!ObjectId.isValid(id)) {
    return null;
  }
  const code = normalizeCode(input.code);
  const libelle = input.libelle.trim();
  if (code.length < 2 || libelle.length < 2) {
    return null;
  }
  const db = await getDatabase();
  const col = db.collection<StoredAgenceDocument>(AGENCES_COLLECTION);
  const oid = new ObjectId(id);
  const existing = await col.findOne({ _id: oid });
  if (!existing) {
    return null;
  }
  if (code !== existing.code) {
    const dup = await col.findOne({ code, _id: { $ne: oid } });
    if (dup) {
      throw new Error("DUPLICATE_AGENCE_CODE");
    }
  }
  const now = new Date();
  await col.updateOne({
    _id: oid,
  }, {
    $set: {
      code,
      libelle,
      zoneGeographique: input.zoneGeographique,
      actif: input.actif,
      updatedAt: now,
    },
  });
  return findAgenceById(id);
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
