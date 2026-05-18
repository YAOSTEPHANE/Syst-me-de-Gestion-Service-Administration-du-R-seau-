import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { zodBadRequest } from "@/lib/api/endpoint-helpers";
import { requireApiAuth } from "@/lib/auth/guards";

const schema = z.object({
  backupName: z.string().regex(/^backup-\d{8}-\d{6}$/),
  dropCollections: z.boolean().optional().default(true),
  restoreUploads: z.boolean().optional().default(true),
  dryRun: z.boolean().optional().default(false),
  verifyChecksum: z.boolean().optional().default(true),
});

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(request, { roles: ["CHEF_SERVICE"] });
  if ("error" in auth) return auth.error;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return zodBadRequest(parsed.error, "Paramètres de restauration invalides");
  }

  try {
    const { restoreLocalBackup } = await import("@/lib/lonaci/local-backups");
    const result = await restoreLocalBackup(parsed.data);
    const summary = result.dryRun
      ? "Simulation de restauration terminée (aucune écriture)."
      : "Restauration locale terminée.";
    return NextResponse.json(
      {
        message: summary,
        result,
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur restauration";
    return NextResponse.json({ message }, { status: 500 });
  }
}
