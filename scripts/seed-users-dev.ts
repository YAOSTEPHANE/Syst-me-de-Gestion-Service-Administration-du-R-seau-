/**
 * Restaure les comptes utilisateurs de démonstration / dev (idempotent).
 * Mot de passe commun : SEED_USERS_PASSWORD ou Admin@123456
 *
 * Usage : ALLOW_SEED_USERS=true npm run seed:users
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { LonaciRole } from "../src/lib/lonaci/constants";

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

const DEV_USERS: Array<{
  email: string;
  nom: string;
  prenom: string;
  role: LonaciRole;
}> = [
  { email: "admin@lonaci.ci", nom: "Admin", prenom: "ADMR", role: "CHEF_SERVICE" },
  {
    email: "yannick1232009@gmail.com",
    nom: "N'guessan",
    prenom: "Yannick",
    role: "ASSIST_CDS",
  },
  { email: "mathieu@gmail.com", nom: "mathieu", prenom: "koffi", role: "CHEF_SECTION" },
  { email: "kyan@live.fr", nom: "jo", prenom: "kyan", role: "AGENT" },
];

async function main() {
  if (process.env.ALLOW_SEED_USERS !== "true") {
    console.log(
      "Seed utilisateurs désactivé. Définir ALLOW_SEED_USERS=true puis relancer (npm run seed:users).",
    );
    process.exit(0);
  }

  const root = process.cwd();
  loadEnvFile(resolve(root, ".env"), false);
  loadEnvFile(resolve(root, ".env.local"), true);
  const runtimeEnv = process.env as NodeJS.ProcessEnv & { NODE_ENV?: string };
  runtimeEnv.NODE_ENV ??= "development";

  const password = (process.env.SEED_USERS_PASSWORD ?? process.env.ADMIN_PASSWORD ?? "Admin@123456").trim();
  if (password.length < 8) {
    throw new Error("SEED_USERS_PASSWORD doit contenir au moins 8 caractères");
  }

  const { initMongoSrvStandardUri } = await import("../src/lib/mongodb-srv-standard");
  await initMongoSrvStandardUri();

  const [{ createUser, ensureUsersIndexes }, { hashPassword }] = await Promise.all([
    import("../src/lib/lonaci/users"),
    import("../src/lib/auth/password"),
  ]);
  const { prisma } = await import("../src/lib/prisma");

  await ensureUsersIndexes();
  const passwordHash = await hashPassword(password);

  for (const spec of DEV_USERS) {
    const email = spec.email.trim().toLowerCase();
    const existing = await prisma.user.findFirst({ where: { email } });

    if (existing) {
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          nom: spec.nom,
          prenom: spec.prenom,
          role: spec.role,
          actif: true,
          deletedAt: null,
          passwordHash,
          passwordChangedAt: new Date(),
          updatedAt: new Date(),
        },
      });
      console.log(`Restauré / mis à jour : ${email} (${spec.role})`);
      continue;
    }

    const user = await createUser({
      email,
      passwordHash,
      nom: spec.nom,
      prenom: spec.prenom,
      role: spec.role,
      agenceId: null,
      produitsAutorises: [],
    });
    console.log(`Créé : ${user.email} (${user.role})`);
  }

  console.log(
    `\nTerminé. Mot de passe pour tous : ${password === "Admin@123456" ? "Admin@123456 (défaut)" : "(SEED_USERS_PASSWORD)"}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Erreur seed-users: ${message}`);
    process.exit(1);
  });
