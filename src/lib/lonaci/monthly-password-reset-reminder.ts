import { createHash, randomBytes } from "crypto";

import {
  formatUtcYearMonth,
  isLastUtcDayOfMonth,
  MONTHLY_PASSWORD_RESET_TOKEN_MS,
} from "@/lib/auth/password-policy";
import { sendSmtpEmail } from "@/lib/email/smtp";
import { logger } from "@/lib/observability/logger";
import {
  clearResetPasswordToken,
  listUsersNeedingMonthlyPasswordResetReminder,
  markPasswordResetReminderSentForMonth,
  setResetPasswordToken,
} from "@/lib/lonaci/users";

export interface MonthlyPasswordResetReminderResult {
  skipped: boolean;
  reason?: string;
  endingMonthKey?: string;
  candidates: number;
  emailed: number;
  emailFailed: number;
  smtpNotConfigured: number;
}

/**
 * Dernier jour du mois civil UTC : génère un token de réinitialisation et envoie un e-mail à chaque chef·fe de service
 * actif·ve qui n’a pas encore reçu le rappel pour ce mois (`passwordResetReminderSentForMonth`).
 */
export async function runMonthlyPasswordResetReminderJob(options: {
  now?: Date;
  appOrigin: string;
}): Promise<MonthlyPasswordResetReminderResult> {
  const now = options.now ?? new Date();
  if (!isLastUtcDayOfMonth(now)) {
    return {
      skipped: true,
      reason: "not_last_utc_day_of_month",
      candidates: 0,
      emailed: 0,
      emailFailed: 0,
      smtpNotConfigured: 0,
    };
  }

  const endingMonthKey = formatUtcYearMonth(now);
  const users = await listUsersNeedingMonthlyPasswordResetReminder(endingMonthKey);
  const origin = options.appOrigin.replace(/\/$/, "");

  let emailed = 0;
  let emailFailed = 0;
  let smtpNotConfigured = 0;

  for (const user of users) {
    const uid = user._id ?? "";
    if (!uid) continue;

    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(now.getTime() + MONTHLY_PASSWORD_RESET_TOKEN_MS);

    try {
      await setResetPasswordToken(uid, tokenHash, expiresAt);
    } catch (e) {
      logger.error("monthly-password-reset: set token failed", {
        event: "MONTHLY_PASSWORD_RESET_TOKEN_WRITE_FAILED",
        userId: uid,
        err: String(e),
      });
      emailFailed += 1;
      continue;
    }

    const resetLink = `${origin}/login?resetToken=${encodeURIComponent(rawToken)}`;
    const body = [
      `Bonjour ${user.prenom},`,
      "",
      "Conformément à la politique de sécurité, veuillez renouveler votre mot de passe (rotation mensuelle).",
      "Voici un lien de réinitialisation automatique (valable 7 jours) :",
      resetLink,
      "",
      "Si vous n’êtes pas concerné(e), contactez votre administrateur.",
    ].join("\n");

    const emailResult = await sendSmtpEmail(
      [user.email],
      "Rappel fin de mois — réinitialisation de votre mot de passe",
      body,
    );

    if (emailResult.sent) {
      await markPasswordResetReminderSentForMonth(uid, endingMonthKey);
      emailed += 1;
    } else {
      await clearResetPasswordToken(uid);
      if (emailResult.skippedReason?.includes("SMTP non configure")) {
        smtpNotConfigured += 1;
      } else {
        emailFailed += 1;
      }
      logger.warn("monthly-password-reset: e-mail non envoyé", {
        event: "MONTHLY_PASSWORD_RESET_EMAIL_SKIPPED",
        userId: uid,
        skippedReason: emailResult.skippedReason,
      });
    }
  }

  return {
    skipped: false,
    endingMonthKey,
    candidates: users.length,
    emailed,
    emailFailed,
    smtpNotConfigured,
  };
}
