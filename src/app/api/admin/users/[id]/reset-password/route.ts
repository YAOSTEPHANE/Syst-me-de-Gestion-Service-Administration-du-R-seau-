import { randomBytes, createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireApiAuth } from "@/lib/auth/guards";
import { findUserById, setResetPasswordToken } from "@/lib/lonaci/users";
import { sendSmtpEmail } from "@/lib/email/smtp";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const bodySchema = z.object({
  newPassword: z.string().min(8).optional(),
});

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth(request, { roles: ["CHEF_SERVICE"] });
  if ("error" in auth) {
    return auth.error;
  }

  const { id } = await context.params;
  const target = await findUserById(id);
  if (!target) {
    return NextResponse.json({ message: "Compte introuvable" }, { status: 404 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ message: "Donnees invalides" }, { status: 400 });
  }

  // Génère un lien de reset temporaire (usage email) ; le Chef(fe) de service peut le transmettre au user.
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  await setResetPasswordToken(target._id ?? "", tokenHash, expiresAt);

  const origin = process.env.NEXT_PUBLIC_APP_URL?.trim() ?? request.nextUrl.origin;
  const resetLink = `${origin}/login?resetToken=${encodeURIComponent(rawToken)}`;
  const emailResult = await sendSmtpEmail(
    [target.email],
    "Réinitialisation de votre mot de passe",
    `Bonjour ${target.prenom},\n\nUn administrateur a demandé une réinitialisation de votre mot de passe.\nLien valable 1 heure:\n${resetLink}\n\nSi ce n'était pas attendu, contactez le Chef(fe) de service.`,
  );

  return NextResponse.json(
    {
      ok: true,
      sentByEmail: emailResult.sent,
      message: emailResult.sent
        ? "Lien de réinitialisation envoyé."
        : "Lien de réinitialisation généré (email non configuré).",
      // En dev/sans SMTP, renvoyer le token permet de finaliser le reset.
      resetToken: emailResult.sent ? undefined : rawToken,
      expiresAt: expiresAt.toISOString(),
    },
    { status: 200 },
  );
}
