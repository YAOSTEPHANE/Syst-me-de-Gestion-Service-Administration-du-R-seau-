/**
 * Affiche la config Mongo (sans secrets) et teste la résolution DNS / ping.
 * Usage : npx tsx scripts/diagnose-mongo-env.ts
 */
import { existsSync, readFileSync } from "node:fs";
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

function describeMongoUrl(name: string, raw?: string) {
  if (!raw?.trim()) {
    console.log(`  ${name}: (absent)`);
    return null;
  }
  try {
    const u = new URL(raw.replace(/^mongodb(\+srv)?:/, "https:"));
    const host = u.hostname;
    const db = u.pathname.replace(/^\//, "").split("/")[0] || "(défaut driver)";
    const scheme = raw.startsWith("mongodb+srv:") ? "mongodb+srv" : "mongodb";
    console.log(`  ${name}: ${scheme} → hôte=${host}, base=${db}`);
    return host;
  } catch {
    console.log(`  ${name}: défini mais URL non analysable`);
    return null;
  }
}

async function main() {
  const root = process.cwd();
  console.log("[diagnose-mongo] Fichiers env :");
  console.log(`  .env       : ${existsSync(resolve(root, ".env")) ? "oui" : "non"}`);
  console.log(`  .env.local : ${existsSync(resolve(root, ".env.local")) ? "oui" : "non"}`);

  loadEnvFile(resolve(root, ".env"), false);
  loadEnvFile(resolve(root, ".env.local"), true);
  const { initMongoSrvStandardUri } = await import("../src/lib/mongodb-srv-standard");
  await initMongoSrvStandardUri();

  console.log("\n[diagnose-mongo] Variables :");
  const dbUrl = process.env.DATABASE_URL;
  const mongoUri = process.env.MONGODB_URI;
  const hostFromDb = describeMongoUrl("DATABASE_URL", dbUrl);
  const hostFromMongo = describeMongoUrl("MONGODB_URI", mongoUri);
  console.log(`  MONGODB_DB: ${process.env.MONGODB_DB?.trim() || "(absent, déduit de l'URL)"}`);

  const srvHost =
    dbUrl?.includes("mongodb+srv") || mongoUri?.includes("mongodb+srv")
      ? (hostFromDb ?? hostFromMongo)
      : null;

  if (srvHost) {
    const srvName = `_mongodb._tcp.${srvHost}`;
    console.log(`\n[diagnose-mongo] DNS SRV ${srvName} :`);
    try {
      const { resolveSrv } = await import("node:dns/promises");
      const records = await resolveSrv(srvName);
      console.log(`  OK — ${records.length} enregistrement(s), ex. ${records[0]?.name}:${records[0]?.port}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  ÉCHEC — ${msg}`);
      console.log("  → VPN / pare-feu / DNS d’entreprise bloquent souvent mongodb+srv.");
    }
  }

  console.log("\n[diagnose-mongo] Ping applicatif (Prisma) :");
  try {
    const { prisma } = await import("../src/lib/prisma");
    await prisma.$runCommandRaw({ ping: 1 });
    await prisma.$disconnect();
    console.log("  OK");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  ÉCHEC — ${msg.split("\n")[0]}`);
  }

  if (!process.env.MONGODB_DNS_SERVERS?.trim()) {
    console.log("\n[diagnose-mongo] Contournement DNS SRV (réseau d’entreprise) :");
    console.log("  Ajouter dans .env.local : MONGODB_DNS_SERVERS=8.8.8.8,1.1.1.1");
    console.log("  Puis relancer : npm run verify:db");
  }

  console.log("\n[diagnose-mongo] Pistes :");
  console.log("  • Atlas : IP autorisée (Network Access) + utilisateur DB avec droits sur la base.");
  console.log("  • Réseau : tester hors VPN ou autoriser *.mongodb.net.");
  console.log("  • Local : commenter DATABASE_URL dans .env.local → repli mongodb://127.0.0.1:27017");
  console.log("    puis lancer MongoDB Community et npm run seed:admin.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
