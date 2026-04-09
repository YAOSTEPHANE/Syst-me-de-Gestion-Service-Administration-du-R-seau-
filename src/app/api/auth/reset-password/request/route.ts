import { randomBytes, createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { enforceRateLimit, zodBadRequest } from "@/lib/api/endpoint-helpers";
import { sendSmtpEmail } from "@/lib/email/smtp";
import { findUserByIdentifier, setResetPasswordToken } from "@/lib/lonaci/users";

const bodySchema = z.object({
  identifier: z.string().min(1),
});

export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return zodBadRequest(parsed.error);
  }

  const rateLimitResponse = await enforceRateLimit(request, {
    namespace: "password-reset-request",
    max: 5,
    windowMs: 60 * 60 * 1000,
    message: "Trop de demandes. Réessayez plus tard.",
  });
  if (rateLimitResponse) return rateLimitResponse;

  const user = await findUserByIdentifier(parsed.data.identifier);
  // Réponse neutre pour éviter l’énumération de comptes.
  if (!user || !user.actif) {
    return NextResponse.json({ ok: true, message: "Si le compte existe, un lien a été envoyé." }, { status: 200 });
  }

  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  await setResetPasswordToken(user._id ?? "", tokenHash, expiresAt);

  const origin = process.env.NEXT_PUBLIC_APP_URL?.trim() ?? request.nextUrl.origin;
  const resetLink = `${origin}/login?resetToken=${encodeURIComponent(rawToken)}`;
  const emailResult = await sendSmtpEmail(
    [user.email],
    "Réinitialisation de votre mot de passe",
    `Bonjour ${user.prenom},\n\nVoici votre lien de réinitialisation (valable 1 heure):\n${resetLink}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message.`,
  );

  if (!emailResult.sent) {
    console.error("[reset-password/request] échec envoi SMTP (token jamais exposé au client)");
  }

  // Ne jamais renvoyer resetToken / expiresAt : un attaquant pourrait réinitialiser sans accès mail.
  return NextResponse.json(
    { ok: true, message: "Si le compte existe, un lien a été envoyé." },
    { status: 200 },
  );
}
