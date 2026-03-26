import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { ensureAppSettingsIndexes, getAppSettings, updateAppSettings } from "@/lib/lonaci/app-settings";
import { requireApiAuth } from "@/lib/auth/guards";

const patchSchema = z
  .object({
    criticalWorkflowEmailEnabled: z.boolean().optional(),
    alertCautionMaxDays: z.number().int().min(1).max(365).optional(),
    alertDossierIdleHours: z.number().int().min(1).max(168).optional(),
    alertPdvIntegrationMaxDays: z.number().int().min(1).max(90).optional(),
    alertAgrementStaleDays: z.number().int().min(1).max(90).optional(),
    alertSuccessionStaleDays: z.number().int().min(1).max(365).optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: "Aucune modification" });

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, { roles: ["CHEF_SERVICE"] });
  if ("error" in auth) return auth.error;

  await ensureAppSettingsIndexes();
  const settings = await getAppSettings();
  return NextResponse.json(
    {
      criticalWorkflowEmailEnabled: settings.criticalWorkflowEmailEnabled,
      alertCautionMaxDays: settings.alertCautionMaxDays,
      alertDossierIdleHours: settings.alertDossierIdleHours,
      alertPdvIntegrationMaxDays: settings.alertPdvIntegrationMaxDays,
      alertAgrementStaleDays: settings.alertAgrementStaleDays,
      alertSuccessionStaleDays: settings.alertSuccessionStaleDays,
      updatedAt: settings.updatedAt.toISOString(),
      updatedByUserId: settings.updatedByUserId,
    },
    { status: 200 },
  );
}

export async function PATCH(request: NextRequest) {
  const auth = await requireApiAuth(request, { roles: ["CHEF_SERVICE"] });
  if ("error" in auth) return auth.error;

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "Donnees invalides", issues: parsed.error.issues }, { status: 400 });
  }

  await ensureAppSettingsIndexes();
  const settings = await updateAppSettings(parsed.data, auth.user);
  return NextResponse.json(
    {
      criticalWorkflowEmailEnabled: settings.criticalWorkflowEmailEnabled,
      alertCautionMaxDays: settings.alertCautionMaxDays,
      alertDossierIdleHours: settings.alertDossierIdleHours,
      alertPdvIntegrationMaxDays: settings.alertPdvIntegrationMaxDays,
      alertAgrementStaleDays: settings.alertAgrementStaleDays,
      alertSuccessionStaleDays: settings.alertSuccessionStaleDays,
      updatedAt: settings.updatedAt.toISOString(),
      updatedByUserId: settings.updatedByUserId,
    },
    { status: 200 },
  );
}
