/**
 * Point d’entrée unique pour l’accès à MongoDB côté serveur.
 *
 * - **`prisma`** : schéma typé Prisma (`prisma/schema.prisma`) — aujourd’hui surtout **users**,
 *   **concessionnaires**, compteurs, etc. Préférer Prisma pour tout nouveau code qui mappe déjà un modèle Prisma.
 * - **`getDatabase` / `getMongoClient`** : driver natif — collections et logique métier dans `src/lib/lonaci/*`
 *   qui ne sont pas (encore) modélisées dans Prisma.
 *
 * Les deux clients ciblent la même base (`MONGODB_URI` / `DATABASE_URL` + `MONGODB_DB`), avec timeouts alignés
 * (`src/lib/prisma.ts`, `src/lib/mongodb.ts`).
 */
export { prisma } from "@/lib/prisma";
export { getDatabase, getMongoClient } from "@/lib/mongodb";
