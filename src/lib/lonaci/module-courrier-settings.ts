import "server-only";

import { getDatabase } from "@/lib/mongodb";
import { MODULE_COURRIER_DEFAULTS } from "@/lib/lonaci/module-courrier-defaults";
import type { ModuleCourrierId, ModuleCourrierTemplate } from "@/lib/lonaci/module-courrier-types";
import type { UserDocument } from "@/lib/lonaci/types";

const COLLECTION = "app_settings";

type StoredDocument = {
  _id: string;
  template?: unknown;
  updatedAt?: Date;
  updatedByUserId?: string;
};

export type ModuleCourrierSettings = {
  template: ModuleCourrierTemplate;
  updatedAt: Date | null;
  updatedByUserId: string;
  isDefault: boolean;
};

function documentIdForModule(moduleId: ModuleCourrierId): string {
  return `courrier-${moduleId}`;
}

function normalizeTemplate(raw: unknown): ModuleCourrierTemplate | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const destinataire = String(row.destinataire ?? "").trim();
  const objet = String(row.objet ?? "").trim();
  const corps = String(row.corps ?? "").trim();
  const signatureLabel = String(row.signatureLabel ?? "").trim();
  if (!destinataire || !objet || !corps || !signatureLabel) return null;
  return {
    destinataire,
    objet,
    corps,
    signatureLabel,
  };
}

export async function getModuleCourrierTemplate(moduleId: ModuleCourrierId): Promise<ModuleCourrierTemplate> {
  const settings = await getModuleCourrierSettings(moduleId);
  return settings.template;
}

export async function getModuleCourrierSettings(moduleId: ModuleCourrierId): Promise<ModuleCourrierSettings> {
  const fallback = MODULE_COURRIER_DEFAULTS[moduleId];
  const db = await getDatabase();
  const row = await db.collection<StoredDocument>(COLLECTION).findOne({ _id: documentIdForModule(moduleId) });
  const stored = normalizeTemplate(row?.template);
  return {
    template: stored ?? fallback,
    updatedAt: row?.updatedAt instanceof Date ? row.updatedAt : null,
    updatedByUserId: typeof row?.updatedByUserId === "string" ? row.updatedByUserId : "",
    isDefault: !stored,
  };
}

export async function saveModuleCourrierTemplate(
  moduleId: ModuleCourrierId,
  template: ModuleCourrierTemplate,
  actor: UserDocument,
): Promise<ModuleCourrierSettings> {
  const normalized = normalizeTemplate(template);
  if (!normalized) {
    throw new Error("COURRIER_TEMPLATE_INVALID");
  }
  const db = await getDatabase();
  const updatedAt = new Date();
  const updatedByUserId = actor._id ?? "";
  await db.collection<StoredDocument>(COLLECTION).updateOne(
    { _id: documentIdForModule(moduleId) },
    {
      $set: {
        template: normalized,
        updatedAt,
        updatedByUserId,
      },
      $setOnInsert: { _id: documentIdForModule(moduleId) },
    },
    { upsert: true },
  );
  return {
    template: normalized,
    updatedAt,
    updatedByUserId,
    isDefault: false,
  };
}
