import { getDatabase } from "@/lib/mongodb";
import type { UserDocument } from "@/lib/lonaci/types";

const COLLECTION = "app_settings";
const GLOBAL_ID = "global";

export interface AppSettingsDocument {
  _id: string;
  criticalWorkflowEmailEnabled: boolean;
  /** Active la génération automatique d'un export supervision dans le cron journalier. */
  supervisionExportCronEnabled: boolean;
  /** Format d'export supervision planifié: pdf/csv/xlsx */
  supervisionExportFormat: "pdf" | "csv" | "xlsx";
  /** Heure UTC d'exécution attendue (0-23) pour l'export supervision planifié. */
  supervisionExportCronHourUtc: number;
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
  /** Objectif mensuel de contrats signés pour le dashboard — défaut 20 */
  dashboardContractsMonthlyTarget: number;
  /** Dernier run automatique export supervision (si activé). */
  supervisionExportLastRunAt: Date | null;
  /** Statut du dernier run automatique export supervision. */
  supervisionExportLastStatus: "OK" | "ERROR" | null;
  updatedAt: Date;
  updatedByUserId: string;
}

type Stored = AppSettingsDocument;

const DEFAULTS: Omit<AppSettingsDocument, "updatedAt" | "updatedByUserId"> = {
  _id: GLOBAL_ID,
  criticalWorkflowEmailEnabled: true,
  supervisionExportCronEnabled: false,
  supervisionExportFormat: "pdf",
  supervisionExportCronHourUtc: 6,
  alertCautionMaxDays: 10,
  alertDossierIdleHours: 48,
  alertPdvIntegrationMaxDays: 5,
  alertAgrementStaleDays: 7,
  alertSuccessionStaleDays: 30,
  dashboardContractsMonthlyTarget: 20,
  supervisionExportLastRunAt: null,
  supervisionExportLastStatus: null,
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
    supervisionExportCronEnabled: row.supervisionExportCronEnabled ?? DEFAULTS.supervisionExportCronEnabled,
    supervisionExportFormat:
      row.supervisionExportFormat === "csv" || row.supervisionExportFormat === "xlsx" || row.supervisionExportFormat === "pdf"
        ? row.supervisionExportFormat
        : DEFAULTS.supervisionExportFormat,
    supervisionExportCronHourUtc:
      typeof row.supervisionExportCronHourUtc === "number" &&
      row.supervisionExportCronHourUtc >= 0 &&
      row.supervisionExportCronHourUtc <= 23
        ? row.supervisionExportCronHourUtc
        : DEFAULTS.supervisionExportCronHourUtc,
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
    dashboardContractsMonthlyTarget:
      typeof row.dashboardContractsMonthlyTarget === "number" && row.dashboardContractsMonthlyTarget > 0
        ? row.dashboardContractsMonthlyTarget
        : DEFAULTS.dashboardContractsMonthlyTarget,
    supervisionExportLastRunAt: row.supervisionExportLastRunAt instanceof Date ? row.supervisionExportLastRunAt : null,
    supervisionExportLastStatus:
      row.supervisionExportLastStatus === "OK" || row.supervisionExportLastStatus === "ERROR"
        ? row.supervisionExportLastStatus
        : null,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt : new Date(),
    updatedByUserId: row.updatedByUserId ?? "",
  };
}

export async function updateAppSettings(
  patch: {
    criticalWorkflowEmailEnabled?: boolean;
    supervisionExportCronEnabled?: boolean;
    supervisionExportFormat?: "pdf" | "csv" | "xlsx";
    supervisionExportCronHourUtc?: number;
    alertCautionMaxDays?: number;
    alertDossierIdleHours?: number;
    alertPdvIntegrationMaxDays?: number;
    alertAgrementStaleDays?: number;
    alertSuccessionStaleDays?: number;
    dashboardContractsMonthlyTarget?: number;
    supervisionExportLastRunAt?: Date | null;
    supervisionExportLastStatus?: "OK" | "ERROR" | null;
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
  if (patch.supervisionExportCronEnabled !== undefined) {
    $set.supervisionExportCronEnabled = patch.supervisionExportCronEnabled;
  }
  if (patch.supervisionExportFormat !== undefined) {
    $set.supervisionExportFormat = patch.supervisionExportFormat;
  }
  if (patch.supervisionExportCronHourUtc !== undefined) {
    $set.supervisionExportCronHourUtc = patch.supervisionExportCronHourUtc;
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
  if (patch.dashboardContractsMonthlyTarget !== undefined) {
    $set.dashboardContractsMonthlyTarget = patch.dashboardContractsMonthlyTarget;
  }
  if (patch.supervisionExportLastRunAt !== undefined) {
    $set.supervisionExportLastRunAt = patch.supervisionExportLastRunAt;
  }
  if (patch.supervisionExportLastStatus !== undefined) {
    $set.supervisionExportLastStatus = patch.supervisionExportLastStatus;
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
