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
  if (process.env.ALLOW_SEED_ADMIN !== "true") {
    console.log(
      "Seed admin desactive: le premier compte CHEF_SERVICE doit etre cree manuellement en base a l'installation. (Definir ALLOW_SEED_ADMIN=true pour forcer ce script.)",
    );
    return;
  }

  const root = process.cwd();
  loadEnvFile(resolve(root, ".env"), false);
  loadEnvFile(resolve(root, ".env.local"), true);
  const runtimeEnv = process.env as Record<string, string | undefined>;
  runtimeEnv.NODE_ENV ??= "development";

  const [{ createUser, ensureUsersIndexes, findUserByEmail }, { hashPassword }] = await Promise.all([
    import("../src/lib/lonaci/users"),
    import("../src/lib/auth/password"),
  ]);

  const email = (process.env.ADMIN_EMAIL ?? "admin@lonaci.ci").trim().toLowerCase();
  const password = (process.env.ADMIN_PASSWORD ?? "Admin@123456").trim();
  const nom = (process.env.ADMIN_NOM ?? "Admin").trim();
  const prenom = (process.env.ADMIN_PRENOM ?? "ADMR").trim();

  if (!email.includes("@")) {
    throw new Error("ADMIN_EMAIL invalide");
  }
  if (password.length < 8) {
    throw new Error("ADMIN_PASSWORD doit contenir au moins 8 caractères");
  }

  await ensureUsersIndexes();

  const existing = await findUserByEmail(email);
  if (existing) {
    console.log(`Utilisateur déjà existant: ${existing.email} (${existing.role})`);
    return;
  }

  const passwordHash = await hashPassword(password);
  const user = await createUser({
    email,
    passwordHash,
    nom,
    prenom,
    role: "CHEF_SERVICE",
    agenceId: null,
    produitsAutorises: [],
  });

  console.log("Admin créé avec succès.");
  console.log(`- id: ${user._id}`);
  console.log(`- email: ${user.email}`);
  console.log(`- role: ${user.role}`);
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Erreur seed admin: ${message}`);
    process.exit(1);
  });
