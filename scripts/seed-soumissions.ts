/**
 * Jeu de données de test pour le module Soumission (phoning / paiement caisse).
 *
 * Usage :
 *   ALLOW_SEED_SOUMISSIONS=true npm run seed:soumissions
 *   SEED_SOUMISSIONS_RESET=true ALLOW_SEED_SOUMISSIONS=true npm run seed:soumissions
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { ObjectId } from "mongodb";

import type { ClientTypeDistributeur } from "../src/lib/lonaci/client-constants";
import type { SoumissionStatut } from "../src/lib/lonaci/soumission-constants";
import type { UserDocument } from "../src/lib/lonaci/types";

const SEED_MARKER = "[seed-soumissions]";
const SEED_TAG = "SEED-SOU";

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

async function ensureAgence(
  getDb: typeof import("../src/lib/mongodb").getDatabase,
  code: string,
  libelle: string,
): Promise<string> {
  const c = code.trim().toUpperCase();
  const db = await getDb();
  const existing = await db.collection<{ _id: ObjectId }>("agences").findOne({ code: c });
  if (existing) return existing._id.toHexString();
  const now = new Date();
  const { coalesceZoneGeographique } = await import("../src/lib/lonaci/zones-abidjan");
  const zoneGeographique = coalesceZoneGeographique(undefined, c, libelle.trim());
  const r = await db.collection("agences").insertOne({
    code: c,
    libelle: libelle.trim(),
    zoneGeographique,
    actif: true,
    createdAt: now,
    updatedAt: now,
  });
  return r.insertedId.toHexString();
}

type SeedRow = {
  nomComplet: string;
  contact: string;
  typeDistributeur: ClientTypeDistributeur;
  nombreTpe: number;
  statut: SoumissionStatut;
  appele: boolean;
  daysAgo: number;
  observations: string;
  withFiche?: boolean;
};

const SEED_PRODUIT_CYCLE = ["LOTO", "PMU", "SPORT"] as const;

const SEED_ROWS: SeedRow[] = [
  {
    nomComplet: "KOUASSI Jean",
    contact: "+2250700110001",
    typeDistributeur: "NOUVEAU",
    nombreTpe: 1,
    statut: "A_APPELER",
    appele: false,
    daysAgo: 0,
    observations: `${SEED_MARKER} À rappeler aujourd’hui`,
  },
  {
    nomComplet: "TRAORE Aïcha",
    contact: "+2250700110002",
    typeDistributeur: "NOUVEAU",
    nombreTpe: 2,
    statut: "EN_COURS",
    appele: false,
    daysAgo: 1,
    observations: `${SEED_MARKER} Appel en cours`,
  },
  {
    nomComplet: "KOFFI Michel",
    contact: "+2250700110003",
    typeDistributeur: "ANCIEN",
    nombreTpe: 1,
    statut: "EN_ATTENTE_PAIEMENT",
    appele: false,
    daysAgo: 2,
    observations: `${SEED_MARKER} Fiche caisse à présenter`,
    withFiche: true,
  },
  {
    nomComplet: "Bamba Fatou",
    contact: "+2250700110004",
    typeDistributeur: "NOUVEAU",
    nombreTpe: 3,
    statut: "EN_ATTENTE_PAIEMENT",
    appele: true,
    daysAgo: 3,
    observations: `${SEED_MARKER} Appelé — en attente caisse`,
    withFiche: true,
  },
  {
    nomComplet: "YAO Serge",
    contact: "+2250700110005",
    typeDistributeur: "ANCIEN",
    nombreTpe: 1,
    statut: "CONVERTI",
    appele: true,
    daysAgo: 5,
    observations: `${SEED_MARKER} Converti client`,
    withFiche: true,
  },
  {
    nomComplet: "OUATTARA Mariam",
    contact: "+2250700110006",
    typeDistributeur: "NOUVEAU",
    nombreTpe: 0,
    statut: "SANS_SUITE",
    appele: false,
    daysAgo: 7,
    observations: `${SEED_MARKER} Numéro injoignable`,
  },
  {
    nomComplet: "DIALLO Ibrahim",
    contact: "+2250700110007",
    typeDistributeur: "NOUVEAU",
    nombreTpe: 2,
    statut: "A_APPELER",
    appele: false,
    daysAgo: 1,
    observations: `${SEED_MARKER} Agence Yamoussoukro`,
  },
  {
    nomComplet: "N'GUESSAN Claire",
    contact: "+2250700110008",
    typeDistributeur: "ANCIEN",
    nombreTpe: 4,
    statut: "EN_COURS",
    appele: false,
    daysAgo: 4,
    observations: `${SEED_MARKER} Relance prévue`,
  },
];

async function main() {
  const root = process.cwd();
  loadEnvFile(resolve(root, ".env"), false);
  loadEnvFile(resolve(root, ".env.local"), true);
  const runtimeEnv = process.env as Record<string, string | undefined>;
  runtimeEnv.NODE_ENV ??= "development";

  if (process.env.ALLOW_SEED_SOUMISSIONS !== "true") {
    console.log(
      "Seed soumissions désactivé. Définir ALLOW_SEED_SOUMISSIONS=true puis relancer (npm run seed:soumissions).",
    );
    return;
  }

  const { initMongoSrvStandardUri } = await import("../src/lib/mongodb-srv-standard");
  await initMongoSrvStandardUri();

  const [{ getDatabase }, { findUserByEmail }, { userDisplayName }] = await Promise.all([
    import("../src/lib/mongodb"),
    import("../src/lib/lonaci/users"),
    import("../src/lib/lonaci/types"),
  ]);
  const { ensureSoumissionsIndexes } = await import("../src/lib/lonaci/soumissions");
  const { ensureReferentialsIndexes } = await import("../src/lib/lonaci/referentials");

  await ensureReferentialsIndexes();
  await ensureSoumissionsIndexes();

  const db = await getDatabase();
  const col = db.collection("soumissions");

  const existingCount = await col.countDocuments({
    deletedAt: null,
    observations: { $regex: SEED_MARKER.replace(/[[\]]/g, "\\$&") },
  });

  if (existingCount > 0 && process.env.SEED_SOUMISSIONS_RESET !== "true") {
    console.log(
      `${existingCount} soumission(s) de test déjà présentes. Utilisez SEED_SOUMISSIONS_RESET=true pour supprimer et régénérer.`,
    );
    return;
  }

  if (process.env.SEED_SOUMISSIONS_RESET === "true") {
    const del = await col.deleteMany({
      observations: { $regex: SEED_MARKER.replace(/[[\]]/g, "\\$&") },
    });
    console.log(`Reset: ${del.deletedCount} soumission(s) de test supprimée(s).`);
  }

  const adminEmail = (process.env.ADMIN_EMAIL ?? "admin@lonaci.ci").trim().toLowerCase();
  let actor = await findUserByEmail(adminEmail);
  if (!actor) {
    const { prisma } = await import("../src/lib/prisma");
    const fromDb = await prisma.user.findFirst({ where: { deletedAt: null } });
    if (!fromDb) {
      throw new Error("Aucun utilisateur en base : exécutez d’abord seed:admin (ALLOW_SEED_ADMIN=true).");
    }
    actor = {
      _id: fromDb.id,
      email: fromDb.email,
      matricule: null,
      passwordHash: fromDb.passwordHash,
      nom: fromDb.nom,
      prenom: fromDb.prenom,
      role: fromDb.role as UserDocument["role"],
      agenceId: fromDb.agenceId,
      agencesAutorisees: fromDb.agenceId ? [fromDb.agenceId] : [],
      modulesAutorises: [],
      produitsAutorises: fromDb.produitsAutorises,
      actif: fromDb.actif,
      currentSessionId: fromDb.currentSessionId,
      derniereConnexion: fromDb.derniereConnexion,
      lastActivityAt: null,
      resetPasswordTokenHash: null,
      resetPasswordExpiresAt: null,
      createdAt: fromDb.createdAt,
      updatedAt: fromDb.updatedAt,
      deletedAt: fromDb.deletedAt,
      passwordChangedAt: fromDb.passwordChangedAt ?? null,
      passwordResetReminderSentForMonth: fromDb.passwordResetReminderSentForMonth ?? null,
    };
  }

  const actorId = actor._id ?? "";
  const agentName = userDisplayName(actor);

  const abjId = await ensureAgence(getDatabase, "ABJ", "Agence Abidjan Plateau");
  const yamId = await ensureAgence(getDatabase, "YAM", "Agence Yamoussoukro");
  const aboId = await ensureAgence(getDatabase, "ABOBO", "Agence Abobo");

  const now = new Date();
  const docs = SEED_ROWS.map((row, index) => {
    const date = new Date(now);
    date.setDate(date.getDate() - row.daysAgo);
    const agenceId = index === 6 ? yamId : index % 3 === 0 ? aboId : abjId;
    const withFiche = Boolean(row.withFiche);
    const produitCode = SEED_PRODUIT_CYCLE[index % SEED_PRODUIT_CYCLE.length] ?? "LOTO";
    return {
      nomComplet: row.nomComplet,
      contact: row.contact,
      typeDistributeur: row.typeDistributeur,
      nombreTpe: row.nombreTpe,
      agenceId,
      produitCode,
      statut: row.statut,
      appele: row.appele,
      fichePaiementGeneratedAt: withFiche ? date : null,
      fichePaiementGeneratedByUserId: withFiche ? actorId : null,
      fichePaiementGeneratedByName: withFiche ? agentName : null,
      date,
      observations: `${row.observations} · ${SEED_TAG}-${String(index + 1).padStart(3, "0")}`,
      createdByUserId: actorId,
      updatedByUserId: actorId,
      createdAt: date,
      updatedAt: date,
      deletedAt: null,
    };
  });

  const result = await col.insertMany(docs);
  const appeles = docs.filter((d) => d.appele).length;
  const nonAppeles = docs.length - appeles;
  const avecFiche = docs.filter((d) => d.fichePaiementGeneratedAt).length;

  console.log("Soumissions de test créées.");
  console.log(`- total: ${result.insertedCount}`);
  console.log(`- appelés: ${appeles} · non appelés: ${nonAppeles}`);
  console.log(`- avec fiche caisse: ${avecFiche}`);
  console.log(`- agent générateur (fiches): ${agentName}`);
  console.log("- agences: ABJ, ABOBO, YAM");
  console.log(`- produits: ${SEED_PRODUIT_CYCLE.join(", ")}`);
  console.log("Ouvrez /soumissions pour visualiser le jeu (filtres appel / statut).");
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Erreur seed-soumissions: ${message}`);
    process.exit(1);
  });
