import { NextRequest, NextResponse } from "next/server";

import {
  getActivityLast7Days,
  getAgenceTrendsLast30Days,
  getAllAgencesTrendsLast30Days,
  getBancarisationSnapshot,
  getDossierDelaySnapshotLast30Days,
  getContratsActifsByProduit,
  getDossierValidationSnapshot,
  getProduitVolumesLast30Days,
  getTopConcessionnairesActifs,
} from "@/lib/lonaci/dashboard-stats";
import { ensureAppSettingsIndexes, getAppSettings } from "@/lib/lonaci/app-settings";
import { buildReportSummary } from "@/lib/lonaci/reports";
import { ensureSuccessionIndexes, listSuccessionStaleAlerts } from "@/lib/lonaci/succession";
import { listCautionAlertsJ10 } from "@/lib/lonaci/sprint4";
import { requireApiAuth } from "@/lib/auth/guards";

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, {
    roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
  });
  if ("error" in auth) return auth.error;

  await ensureSuccessionIndexes();
  await ensureAppSettingsIndexes();
  const appSettings = await getAppSettings();
  const [
    daily,
    weekly,
    monthly,
    cautionsJ10,
    successionStale,
    activity7d,
    produitSlices,
    bancarisation,
    agenceTrends30j,
    agencesOverview30j,
    topConcessionnairesActifs,
    dossierDelays30j,
    produitVolumes30j,
  ] = await Promise.all([
      buildReportSummary("daily"),
      buildReportSummary("weekly"),
      buildReportSummary("monthly"),
      auth.user.role === "ASSIST_CDS" || auth.user.role === "CHEF_SERVICE"
        ? listCautionAlertsJ10()
        : Promise.resolve([]),
      auth.user.role === "CHEF_SECTION" ||
      auth.user.role === "ASSIST_CDS" ||
      auth.user.role === "CHEF_SERVICE"
        ? listSuccessionStaleAlerts()
        : Promise.resolve([]),
      getActivityLast7Days(),
      getContratsActifsByProduit(5),
      getBancarisationSnapshot(),
      getAgenceTrendsLast30Days(8),
      getAllAgencesTrendsLast30Days(),
      getTopConcessionnairesActifs(5),
      getDossierDelaySnapshotLast30Days(),
      getProduitVolumesLast30Days(8),
    ]);

  const cautionsJ10Count = cautionsJ10.length;
  const dossierValidation = await getDossierValidationSnapshot(
    cautionsJ10Count,
    daily.succession.ouverts,
    daily.succession.stale30j,
    daily.pdvIntegrations.nonFinalise,
  );

  return NextResponse.json(
    {
      alertThresholds: {
        cautionMaxDays: appSettings.alertCautionMaxDays,
        dossierIdleHours: appSettings.alertDossierIdleHours,
        pdvIntegrationMaxDays: appSettings.alertPdvIntegrationMaxDays,
        agrementStaleDays: appSettings.alertAgrementStaleDays,
        successionStaleDays: appSettings.alertSuccessionStaleDays,
      },
      daily,
      weekly,
      monthly,
      cautionsJ10: cautionsJ10Count,
      successionStale: successionStale.length,
      successionStaleItems: successionStale.slice(0, 10),
      activity7d,
      produitSlices,
      dossierValidation,
      bancarisation,
      agenceTrends30j,
      agencesOverview30j,
      topConcessionnairesActifs,
      dossierDelays30j,
      produitVolumes30j,
    },
    { status: 200 },
  );
}
