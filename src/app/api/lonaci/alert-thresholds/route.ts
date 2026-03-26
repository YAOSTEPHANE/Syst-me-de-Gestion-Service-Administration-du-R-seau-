import { NextRequest, NextResponse } from "next/server";

import { ensureAppSettingsIndexes, getAppSettings } from "@/lib/lonaci/app-settings";
import { requireApiAuth } from "@/lib/auth/guards";

/** Seuils d’alerte (lecture) pour l’interface — tout rôle authentifié. */
export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, {
    roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
  });
  if ("error" in auth) return auth.error;

  await ensureAppSettingsIndexes();
  const s = await getAppSettings();
  return NextResponse.json(
    {
      cautionMaxDays: s.alertCautionMaxDays,
      dossierIdleHours: s.alertDossierIdleHours,
      pdvIntegrationMaxDays: s.alertPdvIntegrationMaxDays,
      agrementStaleDays: s.alertAgrementStaleDays,
      successionStaleDays: s.alertSuccessionStaleDays,
    },
    { status: 200 },
  );
}
