import { NextRequest, NextResponse } from "next/server";

import { getAttestationDomiciliationChecklistSettings } from "@/lib/lonaci/attestation-domiciliation-checklist-settings";
import { requireApiAuth } from "@/lib/auth/guards";

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, {
    roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE", "AUDITEUR"],
  });
  if ("error" in auth) return auth.error;

  const settings = await getAttestationDomiciliationChecklistSettings();
  return NextResponse.json(
    {
      items: settings.items.map((item) => ({
        id: item.id,
        libelle: item.libelle,
        obligatoire: item.obligatoire !== false,
      })),
      updatedAt: settings.updatedAt?.toISOString() ?? null,
    },
    { status: 200 },
  );
}
