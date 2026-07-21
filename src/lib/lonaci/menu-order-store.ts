import { getDatabase } from "@/lib/mongodb";
import type { UserDocument } from "@/lib/lonaci/types";
import type { MenuOrderSection } from "@/lib/lonaci/nav-catalog";

const COLLECTION = "app_settings";
const DOCUMENT_ID = "global-menu-order";

type MenuOrderDocument = {
  _id: string;
  order?: unknown;
  updatedAt?: unknown;
  updatedByUserId?: unknown;
};

export type StoredMenuOrder = {
  order: MenuOrderSection[];
  updatedAt: Date | null;
  updatedByUserId: string;
};

function normalizeStoredOrder(value: unknown): MenuOrderSection[] {
  if (!Array.isArray(value)) return [];
  const normalized: MenuOrderSection[] = [];
  for (const entry of value) {
    if (
      typeof entry !== "object" ||
      entry === null ||
      !("section" in entry) ||
      typeof entry.section !== "string" ||
      !("hrefs" in entry) ||
      !Array.isArray(entry.hrefs) ||
      !entry.hrefs.every(
        (href: unknown): href is string => typeof href === "string",
      )
    ) {
      continue;
    }
    normalized.push({ section: entry.section, hrefs: [...entry.hrefs] });
  }
  return normalized;
}

export async function getStoredMenuOrder(): Promise<StoredMenuOrder> {
  const db = await getDatabase();
  const document = await db.collection<MenuOrderDocument>(COLLECTION).findOne({
    _id: DOCUMENT_ID,
  });
  return {
    order: normalizeStoredOrder(document?.order),
    updatedAt: document?.updatedAt instanceof Date ? document.updatedAt : null,
    updatedByUserId:
      typeof document?.updatedByUserId === "string"
        ? document.updatedByUserId
        : "",
  };
}

export async function saveStoredMenuOrder(
  order: MenuOrderSection[],
  actor: UserDocument,
): Promise<StoredMenuOrder> {
  const db = await getDatabase();
  const updatedAt = new Date();
  const updatedByUserId = actor._id ?? "";
  await db.collection<MenuOrderDocument>(COLLECTION).updateOne(
    { _id: DOCUMENT_ID },
    {
      $set: {
        order,
        updatedAt,
        updatedByUserId,
      },
      $setOnInsert: { _id: DOCUMENT_ID },
    },
    { upsert: true },
  );
  return { order, updatedAt, updatedByUserId };
}
