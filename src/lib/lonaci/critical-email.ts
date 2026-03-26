import { getAppSettings } from "@/lib/lonaci/app-settings";
import type { LonaciRole } from "@/lib/lonaci/constants";
import { findUserById, listActiveUsersByRole } from "@/lib/lonaci/users";
import { sendSmtpEmail } from "@/lib/email/smtp";

export async function broadcastCriticalEmailToRole(
  role: LonaciRole,
  subject: string,
  body: string,
): Promise<void> {
  const settings = await getAppSettings();
  if (!settings.criticalWorkflowEmailEnabled) return;

  const users = await listActiveUsersByRole(role);
  const emails = users.map((u) => u.email).filter(Boolean);
  if (emails.length === 0) return;

  await sendSmtpEmail(emails, subject, body);
}

export async function sendCriticalEmailToUserId(
  userId: string,
  subject: string,
  body: string,
): Promise<void> {
  const settings = await getAppSettings();
  if (!settings.criticalWorkflowEmailEnabled) return;
  const user = await findUserById(userId);
  if (!user?.email) return;
  await sendSmtpEmail([user.email], subject, body);
}
