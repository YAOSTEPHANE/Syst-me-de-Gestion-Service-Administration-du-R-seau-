import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { z } from "zod";

import { badRequest, forbidden, notFound, unauthorized } from "@/lib/api/error-responses";
import { enforceRateLimit, zodBadRequest } from "@/lib/api/endpoint-helpers";
import { requireApiAuth } from "@/lib/auth/guards";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { findUserById, findUserByResetPasswordTokenHash, updateUserPassword } from "@/lib/lonaci/users";

const bodySchema = z
  .object({
    token: z.string().min(16).optional(),
    currentPassword: z.string().min(8).optional(),
    newPassword: z.string().min(8),
  })
  .superRefine((value, ctx) => {
    if (!value.token && !value.currentPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "token ou currentPassword requis",
      });
    }
  });

export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return zodBadRequest(parsed.error);
  }

  const { token, currentPassword, newPassword } = parsed.data;
  if (currentPassword && currentPassword === newPassword) {
    return badRequest(
      "Le nouveau mot de passe doit etre different de l'ancien",
      "PASSWORD_SAME_AS_CURRENT",
    );
  }

  // Flux 1: reset via token (email/admin)
  if (token) {
    const rateLimitResponse = await enforceRateLimit(request, {
      namespace: "reset-password-token",
      max: 15,
      windowMs: 15 * 60 * 1000,
      message: "Trop de tentatives. Réessayez plus tard.",
    });
    if (rateLimitResponse) return rateLimitResponse;
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const userByToken = await findUserByResetPasswordTokenHash(tokenHash);
    if (!userByToken) {
      return badRequest("Token invalide ou expire", "INVALID_OR_EXPIRED_TOKEN");
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
  const rateLimitResponseAuthed = await enforceRateLimit(request, {
    namespace: "password-change-authed",
    max: 20,
    windowMs: 60 * 60 * 1000,
    keyPrefix: auth.user._id ?? "anon",
    message: "Trop de tentatives. Réessayez plus tard.",
  });
  if (rateLimitResponseAuthed) return rateLimitResponseAuthed;
  if (!currentPassword) {
    return badRequest("Mot de passe actuel requis", "CURRENT_PASSWORD_REQUIRED");
  }
  if (auth.user.role === "AGENT") {
    return forbidden("Un agent ne peut pas modifier son compte.", "PASSWORD_CHANGE_FORBIDDEN");
  }
  const user = await findUserById(auth.user._id ?? "");
  if (!user) {
    return notFound("Compte introuvable", "ACCOUNT_NOT_FOUND");
  }
  const currentPasswordValid = await verifyPassword(currentPassword, user.passwordHash);
  if (!currentPasswordValid) {
    return unauthorized("Mot de passe actuel invalide", "INVALID_CURRENT_PASSWORD");
  }

  const passwordHash = await hashPassword(newPassword);
  await updateUserPassword(user._id ?? "", passwordHash);

  return NextResponse.json(
    { message: "Mot de passe mis a jour. Merci de vous reconnecter." },
    { status: 200 },
  );
}
