import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type { LonaciRole } from "@/lib/lonaci/constants";
import type { UserDocument } from "@/lib/lonaci/types";

/** Throttle + retry : plusieurs routes en parallèle mettaient à jour le même user (P2034). */
const lastSessionTouchAt = new Map<string, number>();
const SESSION_TOUCH_MIN_INTERVAL_MS = 15_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableWriteConflict(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034";
}

async function runUserWriteWithRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (isRetryableWriteConflict(e) && i < attempts - 1) {
        await sleep(25 * (i + 1) + Math.floor(Math.random() * 40));
        continue;
      }
      throw e;
    }
  }
  throw last;
}

export interface CreateUserInput {
  email: string;
  matricule?: string | null;
  passwordHash: string;
  nom: string;
  prenom: string;
  role: LonaciRole;
  agenceId?: string | null;
  agencesAutorisees?: string[];
  modulesAutorises?: string[];
  produitsAutorises?: string[];
}

export interface UpdateUserAdminInput {
  email?: string;
  matricule?: string | null;
  nom?: string;
  prenom?: string;
  role?: LonaciRole;
  agenceId?: string | null;
  agencesAutorisees?: string[];
  modulesAutorises?: string[];
  produitsAutorises?: string[];
  actif?: boolean;
}

type PrismaUser = Awaited<ReturnType<typeof prisma.user.findFirst>>;

function mapStoredUser(user: NonNullable<PrismaUser>): UserDocument {
  return {
    _id: user.id,
    email: user.email,
    matricule: user.matricule,
    passwordHash: user.passwordHash,
    nom: user.nom,
    prenom: user.prenom,
    role: user.role as LonaciRole,
    agenceId: user.agenceId,
    agencesAutorisees: user.agencesAutorisees ?? [],
    modulesAutorises: user.modulesAutorises ?? [],
    produitsAutorises: user.produitsAutorises,
    actif: user.actif,
    currentSessionId: user.currentSessionId,
    derniereConnexion: user.derniereConnexion,
    lastActivityAt: user.lastActivityAt,
    resetPasswordTokenHash: user.resetPasswordTokenHash,
    resetPasswordExpiresAt: user.resetPasswordExpiresAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    deletedAt: user.deletedAt,
  };
}

export async function ensureUsersIndexes() {
  // Prisma gère les indexes via schema.prisma + `prisma db push`.
  return;
}

export async function findUserByEmail(email: string): Promise<UserDocument | null> {
  const user = await prisma.user.findFirst({
    where: { email: email.trim().toLowerCase(), deletedAt: null },
  });
  return user ? mapStoredUser(user) : null;
}

export async function findUserByMatricule(matricule: string): Promise<UserDocument | null> {
  const user = await prisma.user.findFirst({
    where: { matricule: matricule.trim().toUpperCase(), deletedAt: null },
  });
  return user ? mapStoredUser(user) : null;
}

/**
 * Identifiant de connexion: email ou matricule.
 */
export async function findUserByIdentifier(identifier: string): Promise<UserDocument | null> {
  const normalized = identifier.trim();
  if (!normalized) return null;
  const maybeEmail = normalized.toLowerCase();
  const maybeMatricule = normalized.toUpperCase();
  const user = await prisma.user.findFirst({
    where: {
      deletedAt: null,
      OR: [{ email: maybeEmail }, { matricule: maybeMatricule }],
    },
  });
  return user ? mapStoredUser(user) : null;
}

export async function findUserById(id: string): Promise<UserDocument | null> {
  const user = await prisma.user.findFirst({
    where: { id, deletedAt: null },
  });
  return user ? mapStoredUser(user) : null;
}

export async function listActiveUsersByRole(role: LonaciRole): Promise<UserDocument[]> {
  const rows = await prisma.user.findMany({
    where: { role, actif: true, deletedAt: null },
  });
  return rows.map(mapStoredUser);
}

export async function listUsers(): Promise<UserDocument[]> {
  const rows = await prisma.user.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(mapStoredUser);
}

export async function createUser(input: CreateUserInput): Promise<UserDocument> {
  const user = await prisma.user.create({
    data: {
    email: input.email.trim().toLowerCase(),
    matricule: input.matricule ? input.matricule.trim().toUpperCase() : null,
    passwordHash: input.passwordHash,
    nom: input.nom.trim(),
    prenom: input.prenom.trim(),
    role: input.role,
    agenceId: input.agenceId ?? null,
    agencesAutorisees: input.agencesAutorisees ?? [],
    modulesAutorises: input.modulesAutorises ?? [],
    produitsAutorises: input.produitsAutorises ?? [],
    actif: true,
    currentSessionId: null,
    derniereConnexion: null,
    lastActivityAt: null,
    resetPasswordTokenHash: null,
    resetPasswordExpiresAt: null,
    deletedAt: null,
    },
  });
  return mapStoredUser(user);
}

export async function updateLastLogin(userId: string, sessionId: string): Promise<void> {
  await runUserWriteWithRetry(() =>
    prisma.user.update({
      where: { id: userId },
      data: {
        currentSessionId: sessionId,
        derniereConnexion: new Date(),
        lastActivityAt: new Date(),
        updatedAt: new Date(),
      },
    }),
  );
}

export async function touchSessionActivity(userId: string): Promise<void> {
  const now = Date.now();
  const last = lastSessionTouchAt.get(userId);
  if (last !== undefined && now - last < SESSION_TOUCH_MIN_INTERVAL_MS) {
    return;
  }
  lastSessionTouchAt.set(userId, now);
  if (lastSessionTouchAt.size > 2_000) {
    const cutoff = now - 3_600_000;
    for (const [id, t] of lastSessionTouchAt) {
      if (t < cutoff) lastSessionTouchAt.delete(id);
    }
  }

  await runUserWriteWithRetry(() =>
    prisma.user.update({
      where: { id: userId },
      data: { lastActivityAt: new Date(), updatedAt: new Date() },
    }),
  );
}

/**
 * Re-synchronise `currentSessionId` depuis le JWT quand la base n'a pas encore (ou plus) de session active.
 * Permet d'éviter un 401 "Session invalide" uniquement parce que `currentSessionId` vaut `null`.
 */
export async function setUserCurrentSession(userId: string, sessionId: string): Promise<void> {
  await runUserWriteWithRetry(() =>
    prisma.user.update({
      where: { id: userId },
      data: {
        currentSessionId: sessionId,
        lastActivityAt: new Date(),
        updatedAt: new Date(),
      },
    }),
  );
}

export async function clearCurrentSession(userId: string): Promise<void> {
  await runUserWriteWithRetry(() =>
    prisma.user.update({
      where: { id: userId },
      data: {
        currentSessionId: null,
        updatedAt: new Date(),
      },
    }),
  );
}

export async function updateUserAdmin(userId: string, input: UpdateUserAdminInput): Promise<UserDocument | null> {
  const data: Record<string, unknown> = { updatedAt: new Date() };
  if (input.email !== undefined) data.email = input.email.trim().toLowerCase();
  if (input.matricule !== undefined) data.matricule = input.matricule ? input.matricule.trim().toUpperCase() : null;
  if (input.nom !== undefined) data.nom = input.nom.trim();
  if (input.prenom !== undefined) data.prenom = input.prenom.trim();
  if (input.role !== undefined) data.role = input.role;
  if (input.agenceId !== undefined) data.agenceId = input.agenceId;
  if (input.agencesAutorisees !== undefined) data.agencesAutorisees = input.agencesAutorisees;
  if (input.modulesAutorises !== undefined) data.modulesAutorises = input.modulesAutorises;
  if (input.produitsAutorises !== undefined) data.produitsAutorises = input.produitsAutorises;
  if (input.actif !== undefined) {
    data.actif = input.actif;
    if (!input.actif) data.currentSessionId = null;
  }

  await prisma.user.updateMany({
    where: { id: userId, deletedAt: null },
    data,
  });
  return findUserById(userId);
}

export async function updateUserPassword(userId: string, passwordHash: string): Promise<void> {
  await prisma.user.updateMany({
    where: { id: userId, deletedAt: null },
    data: {
      passwordHash,
      currentSessionId: null,
      resetPasswordTokenHash: null,
      resetPasswordExpiresAt: null,
      updatedAt: new Date(),
    },
  });
}

export async function setResetPasswordToken(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
  await prisma.user.updateMany({
    where: { id: userId, deletedAt: null },
    data: {
      resetPasswordTokenHash: tokenHash,
      resetPasswordExpiresAt: expiresAt,
      updatedAt: new Date(),
    },
  });
}

export async function findUserByResetPasswordTokenHash(tokenHash: string): Promise<UserDocument | null> {
  const now = new Date();
  const user = await prisma.user.findFirst({
    where: {
      deletedAt: null,
      resetPasswordTokenHash: tokenHash,
      resetPasswordExpiresAt: { gt: now },
    },
  });
  return user ? mapStoredUser(user) : null;
}

export function sanitizeUser(user: UserDocument) {
  return {
    id: user._id ?? "",
    email: user.email,
    matricule: user.matricule,
    nom: user.nom,
    prenom: user.prenom,
    role: user.role,
    agenceId: user.agenceId,
    agencesAutorisees: user.agencesAutorisees,
    modulesAutorises: user.modulesAutorises,
    produitsAutorises: user.produitsAutorises,
    actif: user.actif,
    derniereConnexion: user.derniereConnexion,
  };
}
