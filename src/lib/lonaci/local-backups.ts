import "server-only";

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { EJSON } from "bson";

import { getDatabase } from "@/lib/mongodb";

export interface LocalBackupManifest {
  createdAt: string;
  database: string;
  collections: Array<{
    name: string;
    documentCount: number;
    file: string;
    checksumSha256?: string;
    compressedBytes?: number;
  }>;
  uploadsCopied: boolean;
}

export interface LocalBackupSummary {
  name: string;
  createdAt: string;
  database: string;
  collectionsCount: number;
  documentsCount: number;
  uploadsCopied: boolean;
}

interface RestoreOptions {
  backupName: string;
  dropCollections?: boolean;
  restoreUploads?: boolean;
  dryRun?: boolean;
  verifyChecksum?: boolean;
}

export interface LocalBackupIntegrityReport {
  valid: boolean;
  filesChecked: number;
  missingFiles: string[];
  checksumMismatches: Array<{ file: string; expected: string; actual: string }>;
}

export interface LocalBackupRestoreResult {
  restoredCollections: number;
  restoredDocuments: number;
  dryRun: boolean;
  integrity: LocalBackupIntegrityReport;
}

function timestampForFolder(date: Date): string {
  const p = (v: number) => String(v).padStart(2, "0");
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(
    date.getSeconds(),
  )}`;
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function getBackupRoot() {
  const cwd = /*turbopackIgnore: true*/ process.cwd();
  const fallbackRoot = join(/*turbopackIgnore: true*/ cwd, "backups");
  const configured = process.env.BACKUP_DIR?.trim();

  if (!configured || configured === "backups") return fallbackRoot;
  if (isAbsolute(configured)) return configured;

  // Sous-dossier relatif strictement sous backups/ (évite un join dynamique sur cwd seul).
  return join(/*turbopackIgnore: true*/ fallbackRoot, configured);
}

function computeSha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function ensureSafeBackupName(name: string) {
  if (!/^backup-\d{8}-\d{6}$/.test(name)) {
    throw new Error("Nom de sauvegarde invalide.");
  }
  return name;
}

function resolveBackupPaths(backupName: string) {
  const backupRoot = getBackupRoot();
  const safeName = ensureSafeBackupName(backupName);
  const backupDir = join(backupRoot, safeName);
  const mongoBackupDir = join(backupDir, "mongo");
  return { backupRoot, safeName, backupDir, mongoBackupDir };
}

function readManifestOrThrow(backupDir: string): LocalBackupManifest {
  const manifestPath = join(backupDir, "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error("Manifest de sauvegarde introuvable.");
  }
  const raw = readFileSync(manifestPath, "utf8");
  return JSON.parse(raw) as LocalBackupManifest;
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
    }
  }
}

export async function createLocalBackup(): Promise<LocalBackupSummary> {
  const backupRoot = getBackupRoot();
  mkdirSync(backupRoot, { recursive: true });

  const backupName = `backup-${timestampForFolder(new Date())}`;
  const backupDir = join(backupRoot, backupName);
  const mongoBackupDir = join(backupDir, "mongo");
  mkdirSync(mongoBackupDir, { recursive: true });

  const db = await getDatabase();
  const collections = (await db.listCollections({}, { nameOnly: true }).toArray())
    .map((row) => row.name)
    .filter((name) => !name.startsWith("system."))
    .sort((a, b) => a.localeCompare(b));

  const manifest: LocalBackupManifest = {
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
    const compressed = gzipSync(Buffer.from(ndjson, "utf8"));
    writeFileSync(outputPath, compressed);
    manifest.collections.push({
      name: collectionName,
      documentCount: rows.length,
      file: `mongo/${fileName}`,
      checksumSha256: computeSha256(compressed),
      compressedBytes: compressed.byteLength,
    });
  }

  const uploadsSource = join(/*turbopackIgnore: true*/ process.cwd(), "uploads");
  if (existsSync(uploadsSource)) {
    const uploadsTarget = join(backupDir, "uploads");
    cpSync(uploadsSource, uploadsTarget, { recursive: true });
    manifest.uploadsCopied = true;
  }

  writeFileSync(join(backupDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  const keepDays = parsePositiveInt(process.env.BACKUP_RETENTION_DAYS, 14);
  cleanupOldBackups(backupRoot, keepDays, backupDir);

  return {
    name: backupName,
    createdAt: manifest.createdAt,
    database: manifest.database,
    collectionsCount: manifest.collections.length,
    documentsCount: manifest.collections.reduce((sum, row) => sum + row.documentCount, 0),
    uploadsCopied: manifest.uploadsCopied,
  };
}

export function listLocalBackups(): LocalBackupSummary[] {
  const backupRoot = getBackupRoot();
  if (!existsSync(backupRoot)) return [];
  const entries = readdirSync(backupRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^backup-\d{8}-\d{6}$/.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => b.localeCompare(a));

  return entries.map((name) => {
    const backupDir = join(backupRoot, name);
    const manifestPath = join(backupDir, "manifest.json");
    if (!existsSync(manifestPath)) {
      const st = statSync(backupDir);
      return {
        name,
        createdAt: st.mtime.toISOString(),
        database: "unknown",
        collectionsCount: 0,
        documentsCount: 0,
        uploadsCopied: existsSync(join(backupDir, "uploads")),
      };
    }
    const raw = readFileSync(manifestPath, "utf8");
    const manifest = JSON.parse(raw) as LocalBackupManifest;
    return {
      name,
      createdAt: manifest.createdAt,
      database: manifest.database,
      collectionsCount: manifest.collections.length,
      documentsCount: manifest.collections.reduce((sum, row) => sum + row.documentCount, 0),
      uploadsCopied: manifest.uploadsCopied,
    };
  });
}

export async function verifyLocalBackupIntegrity(backupName: string): Promise<LocalBackupIntegrityReport> {
  const { backupDir, mongoBackupDir } = resolveBackupPaths(backupName);
  if (!existsSync(backupDir) || !existsSync(mongoBackupDir)) {
    throw new Error("Sauvegarde introuvable.");
  }
  const manifest = readManifestOrThrow(backupDir);
  const missingFiles: string[] = [];
  const checksumMismatches: Array<{ file: string; expected: string; actual: string }> = [];
  let filesChecked = 0;

  for (const row of manifest.collections) {
    const rel = row.file?.trim();
    if (!rel) continue;
    const abs = join(backupDir, rel);
    if (!existsSync(abs)) {
      missingFiles.push(rel);
      continue;
    }
    filesChecked += 1;
    if (row.checksumSha256) {
      const currentHash = computeSha256(readFileSync(abs));
      if (currentHash !== row.checksumSha256) {
        checksumMismatches.push({
          file: rel,
          expected: row.checksumSha256,
          actual: currentHash,
        });
      }
    }
  }

  return {
    valid: missingFiles.length === 0 && checksumMismatches.length === 0,
    filesChecked,
    missingFiles,
    checksumMismatches,
  };
}

export async function restoreLocalBackup(options: RestoreOptions): Promise<LocalBackupRestoreResult> {
  const { backupDir, mongoBackupDir } = resolveBackupPaths(options.backupName);
  if (!existsSync(backupDir) || !existsSync(mongoBackupDir)) {
    throw new Error("Sauvegarde introuvable.");
  }
  const manifest = readManifestOrThrow(backupDir);
  const integrity = await verifyLocalBackupIntegrity(options.backupName);
  if (options.verifyChecksum !== false && !integrity.valid) {
    throw new Error("La sauvegarde est corrompue (fichiers manquants ou checksum invalide).");
  }

  const db = await getDatabase();
  const files = manifest.collections
    .map((item) => item.file)
    .filter((name) => typeof name === "string" && name.endsWith(".ndjson.gz"))
    .sort((a, b) => a.localeCompare(b));
  if (files.length === 0 && manifest.collections.length === 0) {
    throw new Error("Aucun fichier .ndjson.gz trouvé dans la sauvegarde.");
  }

  if (options.dryRun) {
    return {
      restoredCollections: files.length,
      restoredDocuments: manifest.collections.reduce((sum, row) => sum + row.documentCount, 0),
      dryRun: true,
      integrity,
    };
  }

  let restoredDocuments = 0;
  for (const fileRelativePath of files) {
    const fileName = fileRelativePath.replace(/^mongo\//, "");
    const collectionName = fileName.replace(/\.ndjson\.gz$/, "");
    if (options.dropCollections !== false) {
      await db.collection(collectionName).deleteMany({});
    }
    const fullPath = join(mongoBackupDir, fileName);
    const content = gunzipSync(readFileSync(fullPath)).toString("utf8");
    const lines = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (lines.length === 0) continue;
    const docs = lines.map((line) => EJSON.parse(line));
    const batchSize = 500;
    for (let offset = 0; offset < docs.length; offset += batchSize) {
      const chunk = docs.slice(offset, offset + batchSize);
      if (chunk.length > 0) {
        await db.collection(collectionName).insertMany(chunk, { ordered: false });
      }
    }
    restoredDocuments += docs.length;
  }

  if (options.restoreUploads) {
    const uploadsBackupPath = join(backupDir, "uploads");
    if (existsSync(uploadsBackupPath)) {
      const uploadsTargetPath = join(/*turbopackIgnore: true*/ process.cwd(), "uploads");
      rmSync(uploadsTargetPath, { recursive: true, force: true });
      cpSync(uploadsBackupPath, uploadsTargetPath, { recursive: true });
    }
  }

  return { restoredCollections: files.length, restoredDocuments, dryRun: false, integrity };
}

export function createLocalBackupArchive(backupName: string): { filename: string; mimeType: string; data: Buffer } {
  const backupRoot = getBackupRoot();
  const safeName = ensureSafeBackupName(backupName);
  const backupDir = join(backupRoot, safeName);
  if (!existsSync(backupDir)) {
    throw new Error("Sauvegarde introuvable.");
  }

  const archivePath = join(backupRoot, `${safeName}.tar.gz`);
  const tar = spawnSync("tar", ["-czf", archivePath, "-C", backupRoot, safeName], { encoding: "utf8" });
  if (tar.status !== 0) {
    throw new Error(tar.stderr?.trim() || "Création de l'archive impossible.");
  }

  const data = readFileSync(archivePath);
  rmSync(archivePath, { force: true });
  return {
    filename: `${safeName}.tar.gz`,
    mimeType: "application/gzip",
    data,
  };
}
