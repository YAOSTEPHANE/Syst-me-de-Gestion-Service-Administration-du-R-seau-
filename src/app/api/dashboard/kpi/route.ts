import { NextRequest, NextResponse } from "next/server";

import {
  getActivityLast7Days,
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

function resolveDashboardScopeAgenceId(user: {
  role: string;
  agenceId?: string | null;
  agencesAutorisees?: string[];
}) {
  if (user.role === "CHEF_SERVICE") return null;
  if (user.agenceId?.trim()) return user.agenceId.trim();
  if (Array.isArray(user.agencesAutorisees) && user.agencesAutorisees.length > 0) {
    return user.agencesAutorisees[0]?.trim() || null;
  }
  return null;
}

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, {
    roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
  });
  if ("error" in auth) return auth.error;

  await ensureSuccessionIndexes();
  await ensureAppSettingsIndexes();
  const appSettings = await getAppSettings();
  const scopeAgenceId = resolveDashboardScopeAgenceId(auth.user);
  const [
    daily,
    weekly,
    monthly,
    cautionsJ10,
    successionStale,
    activity7d,
    produitSlices,
    bancarisation,
    agencesOverview30j,
    topConcessionnairesActifs,
    dossierDelays30j,
    produitVolumes30j,
  ] = await Promise.all([
      buildReportSummary("daily", scopeAgenceId),
      buildReportSummary("weekly", scopeAgenceId),
      buildReportSummary("monthly", scopeAgenceId),
      auth.user.role === "ASSIST_CDS" || auth.user.role === "CHEF_SERVICE"
        ? listCautionAlertsJ10(scopeAgenceId)
        : Promise.resolve([]),
      auth.user.role === "CHEF_SECTION" ||
      auth.user.role === "ASSIST_CDS" ||
      auth.user.role === "CHEF_SERVICE"
        ? listSuccessionStaleAlerts(scopeAgenceId)
        : Promise.resolve([]),
      getActivityLast7Days(scopeAgenceId),
      getContratsActifsByProduit(5, scopeAgenceId),
      getBancarisationSnapshot(scopeAgenceId),
      getAllAgencesTrendsLast30Days(scopeAgenceId),
      getTopConcessionnairesActifs(5, scopeAgenceId),
      getDossierDelaySnapshotLast30Days(scopeAgenceId),
      getProduitVolumesLast30Days(8, scopeAgenceId),
    ]);

  const cautionsJ10Count = cautionsJ10.length;
  const agenceTrends30j = [...agencesOverview30j]
    .sort((a, b) => b.total30j - a.total30j)
    .slice(0, 8);
  const dossierValidation = await getDossierValidationSnapshot(
    cautionsJ10Count,
    daily.succession.ouverts,
    daily.succession.stale30j,
    daily.pdvIntegrations.nonFinalise,
    scopeAgenceId,
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
      contractsMonthlyTarget: appSettings.dashboardContractsMonthlyTarget,
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
