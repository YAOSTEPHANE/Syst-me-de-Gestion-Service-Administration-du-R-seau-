/**
 * Restaure une sauvegarde créée par scripts/backup-data.ts.
 * Usage:
 *   npm run restore:data -- --from=backups/backup-YYYYMMDD-HHMMSS --drop --restore-uploads
 */
import { cpSync, existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join, resolve } from "node:path";
import { EJSON } from "bson";

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

function parseArgs(argv: string[]) {
  let from: string | null = null;
  let drop = false;
  let restoreUploads = false;

  for (const rawArg of argv) {
    const arg = rawArg.trim();
    if (!arg) continue;
    if (arg === "--drop") {
      drop = true;
      continue;
    }
    if (arg === "--restore-uploads") {
      restoreUploads = true;
      continue;
    }
    if (arg.startsWith("--from=")) {
      from = arg.slice("--from=".length).trim();
      continue;
    }
    if (!arg.startsWith("--") && !from) {
      from = arg;
    }
  }

  if (!from) {
    throw new Error("Chemin de sauvegarde manquant. Exemple: --from=backups/backup-YYYYMMDD-HHMMSS");
  }

  return { from, drop, restoreUploads };
}

async function main() {
  const root = process.cwd();
  loadEnvFile(resolve(root, ".env"), false);
  loadEnvFile(resolve(root, ".env.local"), true);

  const { from, drop, restoreUploads } = parseArgs(process.argv.slice(2));
  const backupDir = resolve(root, from);
  const mongoBackupDir = join(backupDir, "mongo");

  if (!existsSync(backupDir)) {
    throw new Error(`Sauvegarde introuvable: ${backupDir}`);
  }
  if (!existsSync(mongoBackupDir)) {
    throw new Error(`Dossier mongo introuvable dans la sauvegarde: ${mongoBackupDir}`);
  }

  const files = readdirSync(mongoBackupDir)
    .filter((name) => name.endsWith(".ndjson.gz"))
    .sort((a, b) => a.localeCompare(b));

  if (files.length === 0) {
    throw new Error("Aucun fichier .ndjson.gz trouvé dans le dossier mongo.");
  }

  const { getDatabase, getMongoClient } = await import("../src/lib/mongodb");
  const db = await getDatabase();

  for (const fileName of files) {
    const collectionName = fileName.replace(/\.ndjson\.gz$/, "");
    if (drop) {
      await db.collection(collectionName).deleteMany({});
      console.log(`[restore:data] ${collectionName}: collection vidée.`);
    }

    const fullPath = join(mongoBackupDir, fileName);
    const content = gunzipSync(readFileSync(fullPath)).toString("utf8");
    const lines = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length === 0) {
      console.log(`[restore:data] ${collectionName}: 0 document (fichier vide).`);
      continue;
    }

    const docs = lines.map((line) => EJSON.parse(line));
    const batchSize = 500;
    for (let offset = 0; offset < docs.length; offset += batchSize) {
      const chunk = docs.slice(offset, offset + batchSize);
      if (chunk.length > 0) {
        await db.collection(collectionName).insertMany(chunk, { ordered: false });
      }
    }
    console.log(`[restore:data] ${collectionName}: ${docs.length} document(s) restauré(s).`);
  }

  if (restoreUploads) {
    const uploadsBackupPath = join(backupDir, "uploads");
    if (!existsSync(uploadsBackupPath)) {
      console.log("[restore:data] uploads absent dans la sauvegarde, restauration ignorée.");
    } else {
      const uploadsTargetPath = join(root, "uploads");
      rmSync(uploadsTargetPath, { recursive: true, force: true });
      cpSync(uploadsBackupPath, uploadsTargetPath, { recursive: true });
      console.log("[restore:data] Dossier uploads restauré.");
    }
  }

  const mongoClient = await getMongoClient();
  await mongoClient.close();
  console.log("[restore:data] Restauration terminée.");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[restore:data] Échec: ${message}`);
  process.exit(1);
});
