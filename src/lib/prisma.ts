import { PrismaClient } from "@prisma/client";

import { env } from "@/lib/env";

declare global {
  var __prismaClient: PrismaClient | undefined;
}

function buildDatabaseUrl() {
  const trimmed = env.mongodbUri.trim();
  if (trimmed.includes("://") && trimmed.includes("/")) {
    const slashIndex = trimmed.indexOf("/", trimmed.indexOf("://") + 3);
    if (slashIndex > -1) {
      const base = trimmed.slice(0, slashIndex);
      return `${base}/${env.mongodbDb}`;
    }
  }
  return `${trimmed.replace(/\/+$/, "")}/${env.mongodbDb}`;
}

/**
 * Même délais que le client Mongo natif — évite les timeouts trop courts sur Atlas / réseau lent.
 */
function mergePrismaMongoParams(urlStr: string): string {
  const connect = String(env.mongodbConnectTimeoutMs);
  const serverSel = String(env.mongodbServerSelectionTimeoutMs);
  const u = urlStr.trim();
  const has = (name: string) => new RegExp(`[?&]${name}=`).test(u);
  const parts: string[] = [];
  if (!has("connectTimeoutMS")) parts.push(`connectTimeoutMS=${connect}`);
  if (!has("serverSelectionTimeoutMS")) parts.push(`serverSelectionTimeoutMS=${serverSel}`);
  if (!has("socketTimeoutMS")) parts.push(`socketTimeoutMS=120000`);
  if (parts.length === 0) return u;
  const sep = u.includes("?") ? "&" : "?";
  return `${u}${sep}${parts.join("&")}`;
}

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = buildDatabaseUrl();
}
process.env.DATABASE_URL = mergePrismaMongoParams(process.env.DATABASE_URL);

const prisma = global.__prismaClient ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.__prismaClient = prisma;
}

export { prisma };
