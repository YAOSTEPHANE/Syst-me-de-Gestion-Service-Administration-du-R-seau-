/**
 * Enchaîne seed:admin puis seed:demo avec les flags ALLOW_* activés.
 * Usage : npm run seed:test
 * Pour régénérer le jeu PDV-DEMO-* : SEED_DEMO_RESET=true npm run seed:test
 */
import { execSync } from "node:child_process";
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

  const env = {
    ...process.env,
    NODE_ENV: process.env.NODE_ENV ?? "development",
    ALLOW_SEED_ADMIN: "true",
    ALLOW_SEED_DEMO: "true",
  };

  const opts = { cwd: root, env, stdio: "inherit" as const };

  console.log("=== Données de test : admin (CHEF_SERVICE si absent) ===\n");
  execSync("npx tsx scripts/seed-admin.ts", opts);

  console.log("\n=== Données de test : PDV-DEMO-*, dossiers, contrats, etc. ===\n");
  execSync("npx tsx scripts/seed-demo.ts", opts);

  console.log("\nTerminé. Connectez-vous avec ADMIN_EMAIL / ADMIN_PASSWORD (.env.local).");
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Erreur seed-test-data: ${message}`);
    process.exit(1);
  });
