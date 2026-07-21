import { getAppSettings } from "@/lib/lonaci/app-settings";
import type { LonaciRole } from "@/lib/lonaci/constants";
import { findUserById, listActiveUsersByRole } from "@/lib/lonaci/users";
import { sendSmtpEmail } from "@/lib/email/smtp";
import { userMatchesAgence } from "@/lib/lonaci/access";

export async function broadcastCriticalEmailToRole(
  role: LonaciRole,
  subject: string,
  body: string,
  targetAgenceId?: string | null,
): Promise<void> {
  const settings = await getAppSettings();
  if (!settings.criticalWorkflowEmailEnabled) return;

  const roleUsers = await listActiveUsersByRole(role);
  const users =
    targetAgenceId === undefined
      ? roleUsers
      : roleUsers.filter((user) => userMatchesAgence(user, targetAgenceId));
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
