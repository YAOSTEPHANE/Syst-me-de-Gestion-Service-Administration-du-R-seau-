import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

type CliOptions = {
  file: string;
  collection: string;
  mode: "insert" | "upsert";
  upsertBy: string | null;
};

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

function getArg(flag: string): string | null {
  const idx = process.argv.findIndex((x) => x === flag);
  if (idx < 0) return null;
  return process.argv[idx + 1] ?? null;
}

function parseOptions(): CliOptions {
  const file = getArg("--file");
  const collection = getArg("--collection");
  const modeArg = (getArg("--mode") ?? "insert").toLowerCase();
  const upsertBy = getArg("--upsert-by");

  if (!file) {
    throw new Error("Argument manquant: --file <chemin>");
  }
  if (!collection) {
    throw new Error("Argument manquant: --collection <nom>");
  }
  if (modeArg !== "insert" && modeArg !== "upsert") {
    throw new Error("Mode invalide: --mode doit être insert ou upsert");
  }
  if (modeArg === "upsert" && !upsertBy) {
    throw new Error("En mode upsert, préciser --upsert-by <champ>");
  }

  return {
    file,
    collection,
    mode: modeArg,
    upsertBy: upsertBy ?? null,
  };
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((v) => v.trim());
}

function coerceCsvValue(value: string): unknown {
  if (value === "") return null;
  const lower = value.toLowerCase();
  if (lower === "true") return true;
  if (lower === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    const n = Number(value);
    if (!Number.isNaN(n)) return n;
  }
  return value;
}

function parseCsv(content: string): Record<string, unknown>[] {
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]);
  if (headers.some((h) => !h)) {
    throw new Error("En-têtes CSV invalides");
  }

  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    const row: Record<string, unknown> = {};
    headers.forEach((header, idx) => {
      row[header] = coerceCsvValue(values[idx] ?? "");
    });
    return row;
  });
}

function parseDataFile(filePath: string): Record<string, unknown>[] {
  if (!existsSync(filePath)) {
    throw new Error(`Fichier introuvable: ${filePath}`);
  }

  const content = readFileSync(filePath, "utf8").trim();
  if (!content) return [];

  if (filePath.toLowerCase().endsWith(".json")) {
    const parsed = JSON.parse(content) as unknown;
    if (Array.isArray(parsed)) {
      return parsed as Record<string, unknown>[];
    }
    if (parsed && typeof parsed === "object") {
      return [parsed as Record<string, unknown>];
    }
    throw new Error("JSON invalide: attendu objet ou tableau d'objets");
  }

  if (filePath.toLowerCase().endsWith(".csv")) {
    return parseCsv(content);
  }

  throw new Error("Format non supporté. Utilisez .json ou .csv");
}

async function main() {
  const root = process.cwd();
  loadEnvFile(resolve(root, ".env"), false);
  loadEnvFile(resolve(root, ".env.local"), true);
  const runtimeEnv = process.env as NodeJS.ProcessEnv & { NODE_ENV?: string };
  runtimeEnv.NODE_ENV ??= "development";

  const { file, collection, mode, upsertBy } = parseOptions();
  const filePath = resolve(root, file);
  const rows = parseDataFile(filePath);
  if (rows.length === 0) {
    console.log("Aucune ligne à importer.");
    return;
  }

  const { getDatabase } = await import("../src/lib/mongodb");
  const db = await getDatabase();
  const now = new Date();

  if (mode === "insert") {
    const docs = rows.map((row) => ({
      ...row,
      createdAt: (row.createdAt as unknown) ?? now,
      updatedAt: (row.updatedAt as unknown) ?? now,
    }));
    const res = await db.collection(collection).insertMany(docs);
    console.log(`Import terminé: ${res.insertedCount} document(s) inséré(s) dans "${collection}".`);
    return;
  }

  const upsertKey = upsertBy as string;
  let upserted = 0;
  let modified = 0;
  for (const row of rows) {
    const keyValue = row[upsertKey];
    if (keyValue === undefined || keyValue === null || keyValue === "") {
      throw new Error(`Ligne invalide: champ "${upsertKey}" manquant pour upsert`);
    }
    const updateData: Record<string, unknown> = { ...row, updatedAt: now };
    const res = await db.collection(collection).updateOne(
      { [upsertKey]: keyValue },
      {
        $set: updateData,
        $setOnInsert: { createdAt: now },
      },
      { upsert: true },
    );
    if (res.upsertedCount > 0) upserted += 1;
    if (res.modifiedCount > 0) modified += 1;
  }

  console.log(
    `Import terminé (upsert) dans "${collection}": ${upserted} créé(s), ${modified} mis à jour.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Erreur import-data: ${message}`);
    process.exit(1);
  });
