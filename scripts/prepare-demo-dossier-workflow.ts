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
  const { initMongoSrvStandardUri } = await import("../src/lib/mongodb-srv-standard");
  await initMongoSrvStandardUri();

  const { getDatabase } = await import("../src/lib/mongodb");
  const { transitionDossier, ensureDossierIndexes } = await import("../src/lib/lonaci/dossiers");
  const { findUserByEmail } = await import("../src/lib/lonaci/users");

  await ensureDossierIndexes();
  const db = await getDatabase();
  const brouillon = await db.collection("dossiers").findOne({
    reference: { $regex: /^DOS-DEMO-BROUILLON-/ },
    status: "BROUILLON",
    deletedAt: null,
  });
  if (!brouillon) {
    console.log("Aucun dossier brouillon démo à soumettre.");
    return;
  }

  const agent = await findUserByEmail("kyan@live.fr");
  if (!agent?._id) throw new Error("Compte agent démo introuvable (kyan@live.fr)");

  const id = brouillon._id.toHexString();
  await transitionDossier(id, "SOUMIS", agent, "[seed-demo] soumis pour parcours N1→N2→finalisation");

  console.log(`Dossier ${brouillon.reference} → SOUMIS (prêt pour validation N1).`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
