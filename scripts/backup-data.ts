/**
 * Sauvegarde MongoDB (toutes les collections) + dossier uploads.
 * Usage:
 *   npm run backup:data
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
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

function timestampForFolder(date: Date): string {
  const p = (v: number) => String(v).padStart(2, "0");
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function cleanupOldBackups(backupRoot: string, keepDays: number, currentBackupDir: string) {
  const cutoffMs = Date.now() - keepDays * 24 * 60 * 60 * 1000;
  const entries = readdirSync(backupRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!entry.name.startsWith("backup-")) continue;
    const absolutePath = join(backupRoot, entry.name);
    if (absolutePath === currentBackupDir) continue;
    const stat = statSync(absolutePath);
    if (stat.mtimeMs < cutoffMs) {
      rmSync(absolutePath, { recursive: true, force: true });
      console.log(`[backup:data] Ancienne sauvegarde supprimée: ${entry.name}`);
    }
  }
}

async function main() {
  const root = process.cwd();
  loadEnvFile(resolve(root, ".env"), false);
  loadEnvFile(resolve(root, ".env.local"), true);

  const backupRoot = resolve(root, process.env.BACKUP_DIR?.trim() || "backups");
  mkdirSync(backupRoot, { recursive: true });

  const backupDir = join(backupRoot, `backup-${timestampForFolder(new Date())}`);
  mkdirSync(backupDir, { recursive: true });

  const mongoBackupDir = join(backupDir, "mongo");
  mkdirSync(mongoBackupDir, { recursive: true });

  const { getDatabase, getMongoClient } = await import("../src/lib/mongodb");
  const db = await getDatabase();

  const collections = (await db.listCollections({}, { nameOnly: true }).toArray())
    .map((row) => row.name)
    .filter((name) => !name.startsWith("system."))
    .sort((a, b) => a.localeCompare(b));

  const manifest: {
    createdAt: string;
    database: string;
    collections: Array<{ name: string; documentCount: number; file: string }>;
    uploadsCopied: boolean;
  } = {
    createdAt: new Date().toISOString(),
    database: db.databaseName,
    collections: [],
    uploadsCopied: false,
  };

  for (const collectionName of collections) {
    const rows = await db.collection(collectionName).find({}).toArray();
    const ndjson = rows.map((row) => EJSON.stringify(row, { relaxed: false })).join("\n");
    const fileName = `${collectionName}.ndjson.gz`;
    const outputPath = join(mongoBackupDir, fileName);
    writeFileSync(outputPath, gzipSync(Buffer.from(ndjson, "utf8")));
    manifest.collections.push({
      name: collectionName,
      documentCount: rows.length,
      file: `mongo/${fileName}`,
    });
    console.log(`[backup:data] ${collectionName}: ${rows.length} document(s)`);
  }

  const uploadsSource = join(root, "uploads");
  if (existsSync(uploadsSource)) {
    const uploadsTarget = join(backupDir, "uploads");
    cpSync(uploadsSource, uploadsTarget, { recursive: true });
    manifest.uploadsCopied = true;
    console.log("[backup:data] Dossier uploads sauvegardé.");
  }

  writeFileSync(join(backupDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  console.log(`[backup:data] Sauvegarde terminée: ${backupDir}`);

  const keepDays = parsePositiveInt(process.env.BACKUP_RETENTION_DAYS, 14);
  cleanupOldBackups(backupRoot, keepDays, backupDir);

  const mongoClient = await getMongoClient();
  await mongoClient.close();
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[backup:data] Échec: ${message}`);
  process.exit(1);
});
