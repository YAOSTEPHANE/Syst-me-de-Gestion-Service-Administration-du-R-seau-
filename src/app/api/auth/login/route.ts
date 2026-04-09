import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";

import { createSessionCookie } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/password";
import { findUserByIdentifier, sanitizeUser, updateLastLogin } from "@/lib/lonaci/users";
import { logAuthAttempt } from "@/lib/lonaci/auth-logs";
import { getClientIp } from "@/lib/security/client-ip";
import { consumeRateLimit } from "@/lib/security/mongo-rate-limit";

const bodySchema = z.object({
  identifier: z.string().min(1),
  password: z.string().min(8),
});

async function safeLogAuthAttempt(payload: Parameters<typeof logAuthAttempt>[0]) {
  try {
    await logAuthAttempt(payload);
  } catch (error) {
    console.error("[auth/login] auth log write failed", error);
  }
}

/** Les journaux passent par Mongo natif : ne pas bloquer la réponse login si Mongo est lent ou absent. */
function queueAuthLog(payload: Parameters<typeof logAuthAttempt>[0]) {
  void safeLogAuthAttempt(payload);
}

export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ message: "Donnees invalides" }, { status: 400 });
  }

  const ip = getClientIp(request);
  const rl = await consumeRateLimit("login", ip, 30, 10 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { message: "Trop de tentatives. Réessayez plus tard." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  const { identifier, password } = parsed.data;
  let user: Awaited<ReturnType<typeof findUserByIdentifier>>;
  try {
    user = await findUserByIdentifier(identifier);
  } catch (error) {
    console.error("[auth/login] user lookup failed", error);
    return NextResponse.json(
      { message: "Base de donnees indisponible. Verifiez MongoDB puis reessayez." },
      { status: 503 },
    );
  }
  const ipAddress = ip === "unknown" ? null : ip;
  const userAgent = request.headers.get("user-agent");

  if (!user || !user.actif) {
    queueAuthLog({
      email: identifier.trim().toLowerCase(),
      userId: null,
      status: "FAILED",
      ipAddress,
      userAgent,
      attemptedAt: new Date(),
      reason: "USER_NOT_FOUND_OR_DISABLED",
    });
    return NextResponse.json({ message: "Identifiants invalides" }, { status: 401 });
  }

  let passwordIsValid: boolean;
  try {
    passwordIsValid = await verifyPassword(password, user.passwordHash);
  } catch (error) {
    console.error("[auth/login] verifyPassword failed", error);
    return NextResponse.json({ message: "Erreur serveur (mot de passe)." }, { status: 500 });
  }
  if (!passwordIsValid) {
    queueAuthLog({
      email: user.email,
      userId: user._id ?? null,
      status: "FAILED",
      ipAddress,
      userAgent,
      attemptedAt: new Date(),
      reason: "INVALID_PASSWORD",
    });
    return NextResponse.json({ message: "Identifiants invalides" }, { status: 401 });
  }

  /* Une seule session « valide » en base ; une nouvelle connexion remplace l’ancienne
   * (cookie effacé, autre appareil, etc.). L’ancien JWT cessera de matcher currentSessionId. */

  const sessionId = randomUUID();
  try {
    await updateLastLogin(user._id ?? "", sessionId);
  } catch (error) {
    console.error("[auth/login] updateLastLogin failed", error);
    return NextResponse.json(
      { message: "Base de donnees indisponible. Verifiez MongoDB puis reessayez." },
      { status: 503 },
    );
  }

  try {
    await createSessionCookie({
      sub: user._id ?? "",
      email: user.email,
      role: user.role,
      sessionId,
    });
  } catch (error) {
    console.error("[auth/login] createSessionCookie failed", error);
    const msg = error instanceof Error ? error.message : "";
    const jwtMisconfigured =
      msg.includes("JWT_SECRET") ||
      msg.includes("Variable d'environnement manquante: JWT_SECRET");
    return NextResponse.json(
      {
        message: jwtMisconfigured
          ? "Configuration serveur : definissez JWT_SECRET sur Vercel (au moins 32 caracteres, valeur aleatoire)."
          : "Erreur serveur (session). Consultez les logs de l hebergeur.",
      },
      { status: 500 },
    );
  }

  queueAuthLog({
    email: user.email,
    userId: user._id ?? null,
    status: "SUCCESS",
    ipAddress,
    userAgent,
    attemptedAt: new Date(),
  });

  return NextResponse.json({ user: sanitizeUser(user) }, { status: 200 });
}
