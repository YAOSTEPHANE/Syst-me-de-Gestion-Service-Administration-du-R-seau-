import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { zodBadRequest } from "@/lib/api/endpoint-helpers";
import { createLocalBackupArchive } from "@/lib/lonaci/local-backups";
import { requireApiAuth } from "@/lib/auth/guards";

const querySchema = z.object({
  name: z.string().regex(/^backup-\d{8}-\d{6}$/),
});

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, { roles: ["CHEF_SERVICE"] });
  if ("error" in auth) return auth.error;

  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
  if (!parsed.success) {
    return zodBadRequest(parsed.error, "Paramètres de téléchargement invalides");
  }

  try {
    const archive = createLocalBackupArchive(parsed.data.name);
    const body = new Uint8Array(archive.data);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": archive.mimeType,
        "Content-Disposition": `attachment; filename="${archive.filename}"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur de téléchargement";
    return NextResponse.json({ message }, { status: 500 });
  }
}
