/**
 * Envoi email optionnel (SMTP). Si les variables ne sont pas définies, les appels sont ignorés.
 * Variables : SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM
 */

export interface SendEmailResult {
  sent: boolean;
  skippedReason?: string;
}

export async function sendSmtpEmail(
  to: string[],
  subject: string,
  text: string,
): Promise<SendEmailResult> {
  const host = process.env.SMTP_HOST?.trim();
  const from = process.env.EMAIL_FROM?.trim() ?? process.env.SMTP_USER?.trim();
  if (!host || !from) {
    return { sent: false, skippedReason: "SMTP non configure (SMTP_HOST / EMAIL_FROM)" };
  }

  const port = Number(process.env.SMTP_PORT ?? "587");
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();

  try {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: user && pass ? { user, pass } : undefined,
    });
    await transporter.sendMail({
      from,
      to: to.join(", "),
      subject,
      text,
    });
    return { sent: true };
  } catch {
    return { sent: false, skippedReason: "Echec envoi SMTP" };
  }
}
