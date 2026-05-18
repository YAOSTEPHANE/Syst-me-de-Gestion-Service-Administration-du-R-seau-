import { NextRequest, NextResponse } from "next/server";

import { requireApiAuth } from "@/lib/auth/guards";

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, { roles: ["CHEF_SERVICE"] });
  if ("error" in auth) return auth.error;

  try {
    const { listLocalBackups } = await import("@/lib/lonaci/local-backups");
    const backups = listLocalBackups();
    return NextResponse.json({ backups }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur liste sauvegardes";
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(request, { roles: ["CHEF_SERVICE"] });
  if ("error" in auth) return auth.error;

  try {
    const { createLocalBackup } = await import("@/lib/lonaci/local-backups");
    const backup = await createLocalBackup();
    return NextResponse.json({ message: "Sauvegarde locale créée.", backup }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur creation sauvegarde";
    return NextResponse.json({ message }, { status: 500 });
  }
}
