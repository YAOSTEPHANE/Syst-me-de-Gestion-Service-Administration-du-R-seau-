import { getDatabase } from "@/lib/mongodb";
import type { UserDocument } from "@/lib/lonaci/types";

const COLLECTION = "app_settings";
const GLOBAL_ID = "global";

export interface AppSettingsDocument {
  _id: string;
  criticalWorkflowEmailEnabled: boolean;
  /** Délai max (jours) avant alerte caution — défaut 10 */
  alertCautionMaxDays: number;
  /** Heures sans action sur dossier contrat avant alerte — défaut 48 */
  alertDossierIdleHours: number;
  /** Délai max (jours) pour une intégration PDV en cours — défaut 5 */
  alertPdvIntegrationMaxDays: number;
  /** Agrément SOUMIS sans mise à jour depuis N jours — défaut 7 */
  alertAgrementStaleDays: number;
  /** Succession ouverte sans activité depuis N jours — défaut 30 */
  alertSuccessionStaleDays: number;
  updatedAt: Date;
  updatedByUserId: string;
}

type Stored = AppSettingsDocument;

const DEFAULTS: Omit<AppSettingsDocument, "updatedAt" | "updatedByUserId"> = {
  _id: GLOBAL_ID,
  criticalWorkflowEmailEnabled: true,
  alertCautionMaxDays: 10,
  alertDossierIdleHours: 48,
  alertPdvIntegrationMaxDays: 5,
  alertAgrementStaleDays: 7,
  alertSuccessionStaleDays: 30,
};

export async function ensureAppSettingsIndexes() {
  const db = await getDatabase();
  await db.collection<Stored>(COLLECTION).createIndexes([{ key: { _id: 1 }, name: "pk" }]);
}

export async function getAppSettings(): Promise<AppSettingsDocument> {
  const db = await getDatabase();
  const row = await db.collection<Stored>(COLLECTION).findOne({ _id: GLOBAL_ID });
  if (!row) {
    return {
      ...DEFAULTS,
      updatedAt: new Date(),
      updatedByUserId: "",
    };
  }
  return {
    _id: GLOBAL_ID,
    criticalWorkflowEmailEnabled: row.criticalWorkflowEmailEnabled ?? true,
    alertCautionMaxDays:
      typeof row.alertCautionMaxDays === "number" && row.alertCautionMaxDays > 0
        ? row.alertCautionMaxDays
        : DEFAULTS.alertCautionMaxDays,
    alertDossierIdleHours:
      typeof row.alertDossierIdleHours === "number" && row.alertDossierIdleHours > 0
        ? row.alertDossierIdleHours
        : DEFAULTS.alertDossierIdleHours,
    alertPdvIntegrationMaxDays:
      typeof row.alertPdvIntegrationMaxDays === "number" && row.alertPdvIntegrationMaxDays > 0
        ? row.alertPdvIntegrationMaxDays
        : DEFAULTS.alertPdvIntegrationMaxDays,
    alertAgrementStaleDays:
      typeof row.alertAgrementStaleDays === "number" && row.alertAgrementStaleDays > 0
        ? row.alertAgrementStaleDays
        : DEFAULTS.alertAgrementStaleDays,
    alertSuccessionStaleDays:
      typeof row.alertSuccessionStaleDays === "number" && row.alertSuccessionStaleDays > 0
        ? row.alertSuccessionStaleDays
        : DEFAULTS.alertSuccessionStaleDays,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt : new Date(),
    updatedByUserId: row.updatedByUserId ?? "",
  };
}

export async function updateAppSettings(
  patch: {
    criticalWorkflowEmailEnabled?: boolean;
    alertCautionMaxDays?: number;
    alertDossierIdleHours?: number;
    alertPdvIntegrationMaxDays?: number;
    alertAgrementStaleDays?: number;
    alertSuccessionStaleDays?: number;
  },
  actor: UserDocument,
): Promise<AppSettingsDocument> {
  const db = await getDatabase();
  const now = new Date();
  const $set: Record<string, unknown> = {
    updatedAt: now,
    updatedByUserId: actor._id ?? "",
  };
  if (patch.criticalWorkflowEmailEnabled !== undefined) {
    $set.criticalWorkflowEmailEnabled = patch.criticalWorkflowEmailEnabled;
  }
  if (patch.alertCautionMaxDays !== undefined) {
    $set.alertCautionMaxDays = patch.alertCautionMaxDays;
  }
  if (patch.alertDossierIdleHours !== undefined) {
    $set.alertDossierIdleHours = patch.alertDossierIdleHours;
  }
  if (patch.alertPdvIntegrationMaxDays !== undefined) {
    $set.alertPdvIntegrationMaxDays = patch.alertPdvIntegrationMaxDays;
  }
  if (patch.alertAgrementStaleDays !== undefined) {
    $set.alertAgrementStaleDays = patch.alertAgrementStaleDays;
  }
  if (patch.alertSuccessionStaleDays !== undefined) {
    $set.alertSuccessionStaleDays = patch.alertSuccessionStaleDays;
  }
  await db.collection<Stored>(COLLECTION).updateOne(
    { _id: GLOBAL_ID },
    {
      $set,
      $setOnInsert: {
        _id: GLOBAL_ID,
      },
    },
    { upsert: true },
  );
  return getAppSettings();
}
