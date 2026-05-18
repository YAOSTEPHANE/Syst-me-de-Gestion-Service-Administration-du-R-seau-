import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";

import { requireApiAuth } from "@/lib/auth/guards";
import { getDatabase } from "@/lib/mongodb";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(_request, { roles: ["CHEF_SERVICE"] });
  if ("error" in auth) return auth.error;

  const { id } = await context.params;
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ message: "Identifiant invalide" }, { status: 400 });
  }

  const db = await getDatabase();
  const row = await db.collection("report_cron_runs").findOne(
    { _id: new ObjectId(id), kind: "supervision_export_daily" },
    { projection: { artifact: 1 } },
  );

  const artifact = row?.artifact as { filename?: string; contentType?: string; dataBase64?: string } | undefined;
  if (!artifact?.filename || !artifact?.dataBase64) {
    return NextResponse.json({ message: "Aucun fichier disponible pour ce run." }, { status: 404 });
  }

  const data = Buffer.from(artifact.dataBase64, "base64");
  return new NextResponse(new Uint8Array(data), {
    status: 200,
    headers: {
      "Content-Type": artifact.contentType ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename="${artifact.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
