/**
 * Remet les dossiers hors BROUILLON en état initial (BROUILLON + historique vide)
 * et soft-delete les contrats liés pour cohérence.
 *
 * Usage: npx tsx scripts/reset-dossier-validations.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvFile(filePath: string, override = false) {
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim().replace(/^"(.*)"$/, "$1");
    if (!key) continue;
    if (override || process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

const VALIDATED_STATUSES = [
  "SOUMIS",
  "VALIDE_N1",
  "VALIDE_N2",
  "FINALISE",
  "REJETE",
] as const;

async function main() {
  const root = process.cwd();
  loadEnvFile(resolve(root, ".env"), false);
  loadEnvFile(resolve(root, ".env.local"), true);

  const { initMongoSrvStandardUri } = await import("../src/lib/mongodb-srv-standard");
  await initMongoSrvStandardUri();

  const { getDatabase, getMongoClient } = await import("../src/lib/mongodb");
  const { prisma } = await import("../src/lib/prisma");

  const db = await getDatabase();
  const dossiers = db.collection("dossiers");
  const signatures = db.collection("dossier_signatures");

  try {
    const filter = {
      deletedAt: null,
      status: { $in: [...VALIDATED_STATUSES] },
    };

    const toReset = await dossiers
      .find(filter, { projection: { _id: 1, reference: 1, status: 1 } })
      .toArray();

    console.log(`Dossiers à réinitialiser: ${toReset.length}`);
    for (const row of toReset) {
      console.log(`  - ${String(row.reference)} (${String(row.status)})`);
    }

    if (toReset.length === 0) {
      console.log("Rien à faire.");
      return;
    }

    const dossierIds = toReset.map((row) => String(row._id));
    const now = new Date();

    const dossierResult = await dossiers.updateMany(filter, {
      $set: {
        status: "BROUILLON",
        history: [],
        updatedAt: now,
      },
    });

    const signatureResult = await signatures.updateMany(
      {
        dossierId: { $in: dossierIds },
        status: { $in: ["PENDING", "SIGNED"] },
      },
      {
        $set: { status: "EXPIRED" },
      },
    );

    const contratResult = await prisma.contrat.updateMany({
      where: {
        dossierId: { in: dossierIds },
        deletedAt: null,
      },
      data: {
        deletedAt: now,
        updatedAt: now,
        status: "RESILIE",
      },
    });

    console.log(
      JSON.stringify(
        {
          dossiersUpdated: dossierResult.modifiedCount,
          signaturesExpired: signatureResult.modifiedCount,
          contratsSoftDeleted: contratResult.count,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect().catch(() => undefined);
    const client = await getMongoClient().catch(() => null);
    await client?.close().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
