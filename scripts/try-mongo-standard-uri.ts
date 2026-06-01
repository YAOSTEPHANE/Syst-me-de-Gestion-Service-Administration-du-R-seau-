/**
 * Teste une URI mongodb:// (sans +srv) dérivée de DATABASE_URL — contourne Prisma/querySrv.
 */
import { existsSync, readFileSync } from "node:fs";
import dns from "node:dns";
import { resolve } from "node:path";

function loadEnvFile(filePath: string, override = false) {
  if (!existsSync(filePath)) return;
  for (const rawLine of readFileSync(filePath, "utf8").split(/\r?\n/)) {
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

function parseSrvUrl(srvUrl: string) {
  const m = srvUrl.match(/^mongodb\+srv:\/\/([^@]+)@([^/?]+)(?:\/([^?]*))?(?:\?(.*))?$/);
  if (!m) throw new Error("DATABASE_URL mongodb+srv invalide");
  const [user, pass = ""] = m[1].split(":", 2).map((s) => decodeURIComponent(s));
  const clusterHost = m[2];
  const db = m[3]?.trim() || "lonaci";
  const query = m[4] ?? "retryWrites=true&w=majority";
  return { user, pass, clusterHost, db, query };
}

async function srvToStandardUri(srvUrl: string): Promise<string> {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
  const { user, pass, clusterHost, db, query } = parseSrvUrl(srvUrl);
  const records = await dns.promises.resolveSrv(`_mongodb._tcp.${clusterHost}`);
  const hosts = records.map((r) => `${r.name}:${r.port}`).join(",");
  const params = new URLSearchParams(query);
  params.set("tls", "true");
  params.set("authSource", "admin");
  return `mongodb://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${hosts}/${db}?${params.toString()}`;
}

async function main() {
  const root = process.cwd();
  loadEnvFile(resolve(root, ".env"), false);
  loadEnvFile(resolve(root, ".env.local"), true);

  const srvUrl = process.env.DATABASE_URL?.trim();
  if (!srvUrl?.startsWith("mongodb+srv://")) {
    console.error("DATABASE_URL doit être mongodb+srv://");
    process.exit(1);
  }

  const standard = await srvToStandardUri(srvUrl);
  const { MongoClient } = await import("mongodb");
  const client = new MongoClient(standard, { serverSelectionTimeoutMS: 20_000 });
  await client.connect();
  const dbName = parseSrvUrl(srvUrl).db;
  await client.db(dbName).command({ ping: 1 });
  await client.close();

  console.log("[try-mongo-standard-uri] Connexion OK avec URI standard (sans +srv).");
  console.log("[try-mongo-standard-uri] Dans Atlas : Connect → Drivers → « Standard connection string ».");
  console.log("[try-mongo-standard-uri] Ou définir DATABASE_URL_STANDARD dans .env.local (voir docs).");
}

main().catch((err: unknown) => {
  console.error("[try-mongo-standard-uri] Échec :", err instanceof Error ? err.message : err);
  process.exit(1);
});
