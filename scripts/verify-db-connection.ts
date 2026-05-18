/**
 * Vérifie que Prisma et le driver Mongo natif joignent la même base (ping).
 * Usage : npm run verify:db
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

async function main() {
  const root = process.cwd();
  loadEnvFile(resolve(root, ".env"), false);
  loadEnvFile(resolve(root, ".env.local"), true);

  const [{ prisma }, { getDatabase }] = await Promise.all([import("../src/lib/prisma"), import("../src/lib/mongodb")]);

  await prisma.$runCommandRaw({ ping: 1 });
  const db = await getDatabase();
  await db.command({ ping: 1 });
  await prisma.$disconnect();

  console.log("[verify:db] Prisma et driver Mongo : connexion OK (ping).");
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[verify:db] Échec : ${message}`);
  process.exit(1);
});
