import "server-only";

import { getDatabase } from "@/lib/mongodb";
import { SUCCESSION_CHECKLIST_DEFAULT_ITEMS } from "@/lib/lonaci/succession-checklist-defaults";
import { normalizeChecklistTemplate } from "@/lib/lonaci/produit-document-checklist";
import type { ProduitDocumentChecklistItem, UserDocument } from "@/lib/lonaci/types";

const COLLECTION = "app_settings";
const DOCUMENT_ID = "succession-ayants-droits-checklist";

type StoredDocument = {
  _id: string;
  items?: unknown;
  updatedAt?: Date;
  updatedByUserId?: string;
};

export type SuccessionChecklistSettings = {
  items: ProduitDocumentChecklistItem[];
  updatedAt: Date | null;
  updatedByUserId: string;
  isDefault: boolean;
};

function normalizeStoredItems(raw: unknown): ProduitDocumentChecklistItem[] {
  if (!Array.isArray(raw)) return [];
  const parsed: ProduitDocumentChecklistItem[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const id = String(r.id ?? "").trim();
    const libelle = String(r.libelle ?? "").trim();
    if (!id || libelle.length < 2) continue;
    parsed.push({
      id,
      libelle,
      obligatoire: r.obligatoire !== false,
    });
  }
  return normalizeChecklistTemplate(parsed);
}

export async function getSuccessionChecklistTemplate(): Promise<ProduitDocumentChecklistItem[]> {
  const settings = await getSuccessionChecklistSettings();
  return settings.items;
}

export async function getSuccessionChecklistSettings(): Promise<SuccessionChecklistSettings> {
  const db = await getDatabase();
  const row = await db.collection<StoredDocument>(COLLECTION).findOne({ _id: DOCUMENT_ID });
  const stored = normalizeStoredItems(row?.items);
  const items = stored.length > 0 ? stored : SUCCESSION_CHECKLIST_DEFAULT_ITEMS;
  return {
    items,
    updatedAt: row?.updatedAt instanceof Date ? row.updatedAt : null,
    updatedByUserId: typeof row?.updatedByUserId === "string" ? row.updatedByUserId : "",
    isDefault: stored.length === 0,
  };
}

export async function saveSuccessionChecklistTemplate(
  items: ProduitDocumentChecklistItem[],
  actor: UserDocument,
): Promise<SuccessionChecklistSettings> {
  const normalized = normalizeChecklistTemplate(items);
  if (!normalized.length) {
    throw new Error("CHECKLIST_EMPTY");
  }
  const db = await getDatabase();
  const updatedAt = new Date();
  const updatedByUserId = actor._id ?? "";
  await db.collection<StoredDocument>(COLLECTION).updateOne(
    { _id: DOCUMENT_ID },
    {
      $set: {
        items: normalized,
        updatedAt,
        updatedByUserId,
      },
      $setOnInsert: { _id: DOCUMENT_ID },
    },
    { upsert: true },
  );
  return {
    items: normalized,
    updatedAt,
    updatedByUserId,
    isDefault: false,
  };
}
