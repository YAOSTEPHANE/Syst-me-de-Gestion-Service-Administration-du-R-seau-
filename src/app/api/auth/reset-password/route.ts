import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { z } from "zod";

import { requireApiAuth } from "@/lib/auth/guards";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { findUserById, findUserByResetPasswordTokenHash, updateUserPassword } from "@/lib/lonaci/users";
import { getClientIp } from "@/lib/security/client-ip";
import { consumeRateLimit } from "@/lib/security/mongo-rate-limit";

const bodySchema = z.object({
  token: z.string().min(16).optional(),
  currentPassword: z.string().min(8).optional(),
  newPassword: z.string().min(8),
});

export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "Donnees invalides", issues: parsed.error.issues }, { status: 400 });
  }

  const { token, currentPassword, newPassword } = parsed.data;
  if (currentPassword && currentPassword === newPassword) {
    return NextResponse.json(
      { message: "Le nouveau mot de passe doit etre different de l'ancien" },
      { status: 400 },
    );
  }

  // Flux 1: reset via token (email/admin)
  if (token) {
    const ip = getClientIp(request);
    const rl = await consumeRateLimit("reset-password-token", ip, 15, 15 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { message: "Trop de tentatives. Réessayez plus tard." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
      );
    }
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const userByToken = await findUserByResetPasswordTokenHash(tokenHash);
    if (!userByToken) {
      return NextResponse.json({ message: "Token invalide ou expire" }, { status: 400 });
    }
    const passwordHash = await hashPassword(newPassword);
    await updateUserPassword(userByToken._id ?? "", passwordHash);
    return NextResponse.json(
      { message: "Mot de passe reinitialise. Vous pouvez vous connecter." },
      { status: 200 },
    );
  }

  // Flux 2: changement classique (session active)
  const auth = await requireApiAuth(request);
  if ("error" in auth) {
    return auth.error;
  }
  const ipAuthed = getClientIp(request);
  const rlAuthed = await consumeRateLimit(
    "password-change-authed",
    `${auth.user._id ?? "anon"}:${ipAuthed}`,
    20,
    60 * 60 * 1000,
  );
  if (!rlAuthed.allowed) {
    return NextResponse.json(
      { message: "Trop de tentatives. Réessayez plus tard." },
      { status: 429, headers: { "Retry-After": String(rlAuthed.retryAfterSec) } },
    );
  }
  if (!currentPassword) {
    return NextResponse.json({ message: "Mot de passe actuel requis" }, { status: 400 });
  }
  if (auth.user.role === "AGENT") {
    return NextResponse.json({ message: "Un agent ne peut pas modifier son compte." }, { status: 403 });
  }
  const user = await findUserById(auth.user._id ?? "");
  if (!user) {
    return NextResponse.json({ message: "Compte introuvable" }, { status: 404 });
  }
  const currentPasswordValid = await verifyPassword(currentPassword, user.passwordHash);
  if (!currentPasswordValid) {
    return NextResponse.json({ message: "Mot de passe actuel invalide" }, { status: 401 });
  }

  const passwordHash = await hashPassword(newPassword);
  await updateUserPassword(user._id ?? "", passwordHash);

  return NextResponse.json(
    { message: "Mot de passe mis a jour. Merci de vous reconnecter." },
    { status: 200 },
  );
}
