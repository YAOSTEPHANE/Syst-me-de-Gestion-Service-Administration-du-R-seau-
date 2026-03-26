import { randomBytes, createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { findUserByIdentifier, setResetPasswordToken } from "@/lib/lonaci/users";
import { sendSmtpEmail } from "@/lib/email/smtp";

const bodySchema = z.object({
  identifier: z.string().min(1),
});

export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "Donnees invalides" }, { status: 400 });
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

  return NextResponse.json(
    {
      ok: true,
      message: "Si le compte existe, un lien a été envoyé.",
      resetToken: emailResult.sent ? undefined : rawToken,
      expiresAt: expiresAt.toISOString(),
    },
    { status: 200 },
  );
}
