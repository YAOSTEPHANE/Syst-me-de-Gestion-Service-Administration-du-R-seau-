import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvFile(path: string, override: boolean) {
  if (!existsSync(path)) return;
  const content = readFileSync(path, "utf-8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (override || process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function ensureDatabaseUrl() {
  if (process.env.DATABASE_URL) return;
  const root = process.cwd();
  loadEnvFile(resolve(root, ".env"), false);
  loadEnvFile(resolve(root, ".env.local"), true);

  if (process.env.DATABASE_URL) return;
  const mongoUri = process.env.MONGODB_URI?.trim();
  const mongoDb = process.env.MONGODB_DB?.trim();
  if (!mongoUri || !mongoDb) return;

  let base = mongoUri.replace(/\/+$/, "");
  const proto = base.indexOf("://");
  if (proto > -1) {
    const afterHostSlash = base.indexOf("/", proto + 3);
    if (afterHostSlash > -1) {
      base = base.slice(0, afterHostSlash);
    }
  }
  process.env.DATABASE_URL = `${base}/${mongoDb}`;
}

ensureDatabaseUrl();

// Prisma CLI charge ce fichier dans ce workspace.
const prismaConfig = {};
export default prismaConfig;
