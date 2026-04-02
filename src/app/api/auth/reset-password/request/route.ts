import { randomBytes, createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { sendSmtpEmail } from "@/lib/email/smtp";
import { findUserByIdentifier, setResetPasswordToken } from "@/lib/lonaci/users";
import { getClientIp } from "@/lib/security/client-ip";
import { consumeRateLimit } from "@/lib/security/mongo-rate-limit";

const bodySchema = z.object({
  identifier: z.string().min(1),
});

export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "Donnees invalides" }, { status: 400 });
  }

  const ip = getClientIp(request);
  const rl = await consumeRateLimit("password-reset-request", ip, 5, 60 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { message: "Trop de demandes. Réessayez plus tard." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

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
