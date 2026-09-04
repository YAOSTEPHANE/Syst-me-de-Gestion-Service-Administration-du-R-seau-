import "server-only";

import { getDatabase } from "@/lib/mongodb";
import { FAIRE_PART_DEFAULT_TEMPLATES } from "@/lib/lonaci/module-faire-part-defaults";
import {
  FAIRE_PART_KIND_META,
  type FairePartKind,
  type FairePartTemplate,
} from "@/lib/lonaci/module-faire-part-types";
import type { UserDocument } from "@/lib/lonaci/types";

const COLLECTION = "app_settings";

type StoredDocument = {
  _id: string;
  template?: unknown;
  updatedAt?: Date;
  updatedByUserId?: string;
};

export type FairePartSettings = {
  kind: FairePartKind;
  template: FairePartTemplate;
  updatedAt: Date | null;
  updatedByUserId: string;
  isDefault: boolean;
};

function normalizeTemplate(raw: unknown): FairePartTemplate | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const destinataire = String(row.destinataire ?? "").trim();
  const objet = String(row.objet ?? "").trim();
  const corps = String(row.corps ?? "").trim();
  const signatureLabel = String(row.signatureLabel ?? "").trim();
  if (!destinataire || !objet || !corps || !signatureLabel) return null;
  return { destinataire, objet, corps, signatureLabel };
}

export async function getFairePartTemplate(kind: FairePartKind): Promise<FairePartTemplate> {
  const settings = await getFairePartSettings(kind);
  return settings.template;
}

export async function getFairePartSettings(kind: FairePartKind): Promise<FairePartSettings> {
  const fallback = FAIRE_PART_DEFAULT_TEMPLATES[kind];
  const documentId = FAIRE_PART_KIND_META[kind].settingsId;
  const db = await getDatabase();
  const row = await db.collection<StoredDocument>(COLLECTION).findOne({ _id: documentId });
  const stored = normalizeTemplate(row?.template);
  return {
    kind,
    template: stored ?? fallback,
    updatedAt: row?.updatedAt instanceof Date ? row.updatedAt : null,
    updatedByUserId: typeof row?.updatedByUserId === "string" ? row.updatedByUserId : "",
    isDefault: !stored,
  };
}

export async function saveFairePartTemplate(
  kind: FairePartKind,
  template: FairePartTemplate,
  actor: UserDocument,
): Promise<FairePartSettings> {
  const normalized = normalizeTemplate(template);
  if (!normalized) {
    throw new Error("FAIRE_PART_TEMPLATE_INVALID");
  }
  const documentId = FAIRE_PART_KIND_META[kind].settingsId;
  const db = await getDatabase();
  const updatedAt = new Date();
  const updatedByUserId = actor._id ?? "";
  await db.collection<StoredDocument>(COLLECTION).updateOne(
    { _id: documentId },
    {
      $set: {
        template: normalized,
        updatedAt,
        updatedByUserId,
      },
      $setOnInsert: { _id: documentId },
    },
    { upsert: true },
  );
  return {
    kind,
    template: normalized,
    updatedAt,
    updatedByUserId,
    isDefault: false,
  };
}
