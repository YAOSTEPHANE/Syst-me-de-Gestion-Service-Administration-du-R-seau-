import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { ObjectId } from "mongodb";

import type { UserDocument } from "../src/lib/lonaci/types";

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

const DEMO_PREFIX = "PDV-DEMO-";

async function resetDemoCollections(
  prisma: typeof import("../src/lib/prisma").prisma,
  getDb: typeof import("../src/lib/mongodb").getDatabase,
) {
  const demos = await prisma.concessionnaire.findMany({
    where: { codePdv: { startsWith: DEMO_PREFIX } },
    select: { id: true },
  });
  const concIds = demos.map((d) => d.id);
  if (concIds.length === 0) return;

  const contrats = await prisma.contrat.findMany({
    where: { concessionnaireId: { in: concIds } },
    select: { id: true },
  });
  const contratIds = contrats.map((c) => c.id);

  const db = await getDb();
  await db.collection("cautions").deleteMany({ contratId: { $in: contratIds } });
  await db.collection("pdv_integrations").deleteMany({
    $or: [
      { codePdv: { $regex: /^PDV-DEMO/ } },
      { reference: { $regex: /^PDVI-DEMO/ } },
      { raisonSociale: { $regex: /\[seed-demo\]/i } },
    ],
  });
  await db.collection("succession_cases").deleteMany({ concessionnaireId: { $in: concIds } });
  await db.collection("dossiers").deleteMany({ concessionnaireId: { $in: concIds } });
  await prisma.contrat.deleteMany({ where: { concessionnaireId: { in: concIds } } });
  await prisma.concessionnaire.deleteMany({ where: { id: { in: concIds } } });
  console.log(`Reset: ${concIds.length} concessionnaires démo supprimés.`);
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
  const r = await db.collection("agences").insertOne({
    code: c,
    libelle: libelle.trim(),
    actif: true,
    createdAt: now,
    updatedAt: now,
  });
  return r.insertedId.toHexString();
}

async function ensureProduit(
  getDb: typeof import("../src/lib/mongodb").getDatabase,
  code: string,
  libelle: string,
): Promise<void> {
  const c = code.trim().toUpperCase();
  const db = await getDb();
  const exists = await db.collection("produits").findOne({ code: c });
  if (exists) return;
  const now = new Date();
  await db.collection("produits").insertOne({
    code: c,
    libelle: libelle.trim(),
    actif: true,
    createdAt: now,
    updatedAt: now,
  });
}

function prismaUserToActor(row: {
  id: string;
  email: string;
  nom: string;
  prenom: string;
  role: string;
  agenceId: string | null;
  produitsAutorises: string[];
  actif: boolean;
  passwordHash: string;
  currentSessionId: string | null;
  derniereConnexion: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}): UserDocument {
  return {
    _id: row.id,
    email: row.email,
    matricule: null,
    passwordHash: row.passwordHash,
    nom: row.nom,
    prenom: row.prenom,
    role: row.role as UserDocument["role"],
    agenceId: row.agenceId,
    agencesAutorisees: row.agenceId ? [row.agenceId] : [],
    modulesAutorises: [],
    produitsAutorises: row.produitsAutorises,
    actif: row.actif,
    currentSessionId: row.currentSessionId,
    derniereConnexion: row.derniereConnexion,
    lastActivityAt: null,
    resetPasswordTokenHash: null,
    resetPasswordExpiresAt: null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

async function main() {
  if (process.env.ALLOW_SEED_DEMO !== "true") {
    console.log(
      "Seed démo désactivé. Définir ALLOW_SEED_DEMO=true puis relancer (optionnel : SEED_DEMO_RESET=true pour remplacer les données PDV-DEMO-*).",
    );
    process.exit(0);
  }

  const root = process.cwd();
  loadEnvFile(resolve(root, ".env"), false);
  loadEnvFile(resolve(root, ".env.local"), true);
  const runtimeEnv = process.env as NodeJS.ProcessEnv & { NODE_ENV?: string };
  runtimeEnv.NODE_ENV ??= "development";

  const [{ prisma }, { getDatabase }, { finalizeContratFromDossier }] = await Promise.all([
    import("../src/lib/prisma"),
    import("../src/lib/mongodb"),
    import("../src/lib/lonaci/contracts"),
  ]);
  const { ensureReferentialsIndexes } = await import("../src/lib/lonaci/referentials");
  const { ensureDossierIndexes } = await import("../src/lib/lonaci/dossiers");
  const { ensureSprint4Indexes } = await import("../src/lib/lonaci/sprint4");
  const { ensureSuccessionIndexes } = await import("../src/lib/lonaci/succession");

  await ensureReferentialsIndexes();
  await ensureDossierIndexes();
  await ensureSprint4Indexes();
  await ensureSuccessionIndexes();

  const existingDemo = await prisma.concessionnaire.findFirst({
    where: { codePdv: `${DEMO_PREFIX}000001` },
  });
  if (existingDemo && process.env.SEED_DEMO_RESET !== "true") {
    console.log(
      "Données démo déjà présentes (PDV-DEMO-000001). Utilisez SEED_DEMO_RESET=true pour supprimer et régénérer.",
    );
    process.exit(0);
  }

  if (process.env.SEED_DEMO_RESET === "true") {
    await resetDemoCollections(prisma, getDatabase);
  }

  const adminEmail = (process.env.ADMIN_EMAIL ?? "admin@lonaci.ci").trim().toLowerCase();
  const { findUserByEmail } = await import("../src/lib/lonaci/users");
  let userRow = await findUserByEmail(adminEmail);
  if (!userRow) {
    const fromDb = await prisma.user.findFirst({ where: { deletedAt: null } });
    if (!fromDb) {
      throw new Error("Aucun utilisateur en base : exécutez d’abord seed:admin (ALLOW_SEED_ADMIN=true).");
    }
    userRow = {
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
    };
  }

  const prismaActor = await prisma.user.findFirst({
    where: { id: userRow._id ?? "" },
  });
  if (!prismaActor) {
    throw new Error("Utilisateur acteur introuvable (Prisma).");
  }
  const actor = prismaUserToActor(prismaActor);

  const abjId = await ensureAgence(getDatabase, "ABJ", "Agence Abidjan Plateau");
  const yamId = await ensureAgence(getDatabase, "YAM", "Agence Yamoussoukro");
  await ensureProduit(getDatabase, "LOTO", "Lonaci Loto");
  await ensureProduit(getDatabase, "PMU", "Paris mutuels urbains");

  const db = await getDatabase();
  const now = new Date();
  const dateEffet = new Date();
  dateEffet.setMonth(dateEffet.getMonth() - 3);

  type ConcSeed = {
    codePdv: string;
    nom: string;
    statut: "ACTIF" | "SUSPENDU" | "RESILIE" | "SUCCESSION_EN_COURS";
    banca: "NON_BANCARISE" | "EN_COURS" | "BANCARISE";
    agenceId: string;
    produits: string[];
    gps: { lat: number; lng: number } | null;
  };

  const plan: ConcSeed[] = [
    {
      codePdv: `${DEMO_PREFIX}000001`,
      nom: "Kouassi Adèle — Tabac Lonaci",
      statut: "ACTIF",
      banca: "BANCARISE",
      agenceId: abjId,
      produits: ["LOTO", "PMU"],
      gps: { lat: 5.36, lng: -4.0083 },
    },
    {
      codePdv: `${DEMO_PREFIX}000002`,
      nom: "Koné Ibrahim — Presse Plateau",
      statut: "ACTIF",
      banca: "EN_COURS",
      agenceId: abjId,
      produits: ["LOTO"],
      gps: { lat: 5.325, lng: -4.02 },
    },
    {
      codePdv: `${DEMO_PREFIX}000003`,
      nom: "Traoré Aminata — Riviera",
      statut: "SUSPENDU",
      banca: "NON_BANCARISE",
      agenceId: yamId,
      produits: ["PMU"],
      gps: { lat: 5.34, lng: -4.005 },
    },
    {
      codePdv: `${DEMO_PREFIX}000004`,
      nom: "Yao Martin — Cocody fermé",
      statut: "RESILIE",
      banca: "BANCARISE",
      agenceId: abjId,
      produits: ["LOTO"],
      gps: null,
    },
    {
      codePdv: `${DEMO_PREFIX}000005`,
      nom: "Brou Succession — En cours",
      statut: "SUCCESSION_EN_COURS",
      banca: "BANCARISE",
      agenceId: yamId,
      produits: ["LOTO"],
      gps: { lat: 6.8276, lng: -5.2893 },
    },
  ];

  const createdIds: string[] = [];

  for (const p of plan) {
    const row = await prisma.concessionnaire.create({
      data: {
        codePdv: p.codePdv,
        nomComplet: p.nom,
        raisonSociale: `${p.nom} [seed-demo]`,
        cniNumero: "CI-DEMO-001",
        photoUrl: null,
        email: `contact-${p.codePdv.toLowerCase().replace(/[^a-z0-9]/g, "")}@demo.lonaci.ci`,
        telephonePrincipal: "+225 07 00 12 34 56",
        telephoneSecondaire: null,
        telephone: "+225 07 00 12 34 56",
        adresse: "Boulevard de la République",
        ville: p.agenceId === abjId ? "Abidjan" : "Yamoussoukro",
        codePostal: null,
        agenceId: p.agenceId,
        produitsAutorises: p.produits,
        statut: p.statut,
        statutBancarisation: p.banca,
        compteBancaire: p.banca === "BANCARISE" ? "CI93 1234 5678 9012 3456 7890 12" : null,
        gps: p.gps,
        piecesJointes: [],
        observations: "Jeu de données démo — seed-demo.ts",
        notesInternes: "[seed-demo]",
        createdByUserId: actor._id ?? "",
        updatedByUserId: actor._id ?? "",
        deletedAt: null,
      },
    });
    createdIds.push(row.id);
  }

  const [id1, id2, id3, , id5] = createdIds;

  async function insertFinalDossierAndContrat(
    concessionnaireId: string,
    agenceId: string,
    produitCode: "LOTO" | "PMU",
    operationType: "NOUVEAU" | "ACTUALISATION",
    suffix: string,
  ) {
    const dossierId = new ObjectId();
    const dossierRef = `DOS-DEMO-${suffix}`;
    const hist = ["SOUMIS", "VALIDE_N1", "VALIDE_N2", "FINALISE"] as const;
    const history = hist.map((status, i) => ({
      status,
      actedByUserId: actor._id ?? "",
      actedAt: new Date(now.getTime() + i * 60_000),
      comment: i === 0 ? null : "[seed-demo]",
    }));

    await db.collection("dossiers").insertOne({
      _id: dossierId,
      type: "CONTRAT_ACTUALISATION",
      reference: dossierRef,
      status: "FINALISE",
      concessionnaireId,
      agenceId,
      payload: {
        produitCode,
        operationType,
        dateEffet: dateEffet.toISOString(),
        commentaire: "[seed-demo]",
      },
      history,
      createdByUserId: actor._id ?? "",
      updatedByUserId: actor._id ?? "",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    const contrat = await finalizeContratFromDossier({
      dossierId: dossierId.toHexString(),
      concessionnaireId,
      produitCode,
      operationType,
      dateEffet,
      actor,
    });
    return contrat;
  }

  await insertFinalDossierAndContrat(id1, abjId, "LOTO", "NOUVEAU", `${createdIds[0].slice(-6)}-loto`);
  await insertFinalDossierAndContrat(id2, abjId, "PMU", "NOUVEAU", `${createdIds[1].slice(-6)}-pmu`);

  const dossierBrouillonId = new ObjectId();
  await db.collection("dossiers").insertOne({
    _id: dossierBrouillonId,
    type: "CONTRAT_ACTUALISATION",
    reference: `DOS-DEMO-BROUILLON-${id3.slice(-4)}`,
    status: "BROUILLON",
    concessionnaireId: id3,
    agenceId: yamId,
    payload: {
      produitCode: "LOTO",
      operationType: "NOUVEAU",
      dateEffet: dateEffet.toISOString(),
      commentaire: "[seed-demo] brouillon PDV suspendu",
    },
    history: [],
    createdByUserId: actor._id ?? "",
    updatedByUserId: actor._id ?? "",
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  });

  const contrat1 = await prisma.contrat.findFirst({
    where: { concessionnaireId: id1, deletedAt: null },
  });
  if (contrat1) {
    await db.collection("cautions").insertOne({
      contratId: contrat1.id,
      montant: 850_000,
      modeReglement: "VIREMENT",
      status: "EN_ATTENTE",
      dueDate: new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000),
      paidAt: null,
      immutableAfterFinal: false,
      createdByUserId: actor._id ?? "",
      updatedByUserId: actor._id ?? "",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
  }

  await db.collection("pdv_integrations").insertOne({
    reference: "PDVI-DEMO-000001",
    codePdv: "PDV-DEMO-INT-001",
    concessionnaireId: null,
    raisonSociale: "Nouveau point [seed-demo] — intégration en cours",
    agenceId: abjId,
    gps: { lat: 5.29, lng: -3.99 },
    status: "EN_COURS",
    finalizedAt: null,
    createdByUserId: actor._id ?? "",
    updatedByUserId: actor._id ?? "",
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  });

  await db.collection("succession_cases").insertOne({
    reference: "SUC-DEMO-000001",
    concessionnaireId: id5,
    agenceId: yamId,
    status: "OUVERT",
    dateDeces: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000),
    ayantDroitNom: "Brou Stéphane",
    ayantDroitTelephone: "+225 05 01 02 03 04",
    ayantDroitEmail: "ayantdroit@demo.lonaci.ci",
    stepHistory: [
      {
        step: "DECLARATION_DECES",
        completedAt: now,
        completedByUserId: actor._id ?? "",
        comment: "[seed-demo]",
      },
    ],
    createdByUserId: actor._id ?? "",
    updatedByUserId: actor._id ?? "",
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  });

  console.log("Seed démo terminé.");
  console.log(`- ${plan.length} concessionnaires (${DEMO_PREFIX}…)`);
  console.log("- 2 dossiers finalisés + contrats (LOTO / PMU), 1 dossier brouillon");
  console.log("- 1 caution en retard (contrat PDV 1)");
  console.log("- 1 intégration PDV en cours (PDVI-DEMO-000001)");
  console.log("- 1 dossier succession ouvert (SUC-DEMO-000001)");
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Erreur seed-demo: ${message}`);
    process.exit(1);
  });
