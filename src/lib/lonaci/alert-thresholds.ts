import { ensureAppSettingsIndexes, getAppSettings } from "@/lib/lonaci/app-settings";

/** Seuils résolus pour les règles d’alerte (persistés dans `app_settings`). */
export async function getResolvedAlertThresholds() {
  await ensureAppSettingsIndexes();
  const s = await getAppSettings();
  return {
    cautionOverdueDays: s.alertCautionMaxDays,
    dossierIdleMs: s.alertDossierIdleHours * 60 * 60 * 1000,
    pdvIntegrationMaxMs: s.alertPdvIntegrationMaxDays * 24 * 60 * 60 * 1000,
    agrementStaleDays: s.alertAgrementStaleDays,
    successionStaleDays: s.alertSuccessionStaleDays,
  };
}
