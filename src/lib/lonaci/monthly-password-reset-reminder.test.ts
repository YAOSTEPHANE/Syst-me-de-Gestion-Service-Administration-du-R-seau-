import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  listUsersNeedingMonthlyPasswordResetReminder: vi.fn(),
  setResetPasswordToken: vi.fn(),
  clearResetPasswordToken: vi.fn(),
  markPasswordResetReminderSentForMonth: vi.fn(),
  sendSmtpEmail: vi.fn(),
}));

vi.mock("@/lib/lonaci/users", () => ({
  listUsersNeedingMonthlyPasswordResetReminder: mocks.listUsersNeedingMonthlyPasswordResetReminder,
  setResetPasswordToken: mocks.setResetPasswordToken,
  clearResetPasswordToken: mocks.clearResetPasswordToken,
  markPasswordResetReminderSentForMonth: mocks.markPasswordResetReminderSentForMonth,
}));

vi.mock("@/lib/email/smtp", () => ({
  sendSmtpEmail: mocks.sendSmtpEmail,
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}));

import type { UserDocument } from "@/lib/lonaci/types";
import { runMonthlyPasswordResetReminderJob } from "./monthly-password-reset-reminder";

function stubUser(overrides: Partial<UserDocument> = {}): UserDocument {
  const now = new Date();
  return {
    _id: "u1",
    email: "agent@test.ci",
    matricule: null,
    passwordHash: "h",
    nom: "Test",
    prenom: "Agent",
    role: "AGENT",
    agenceId: null,
    agencesAutorisees: [],
    modulesAutorises: [],
    produitsAutorises: [],
    actif: true,
    currentSessionId: null,
    derniereConnexion: null,
    lastActivityAt: null,
    resetPasswordTokenHash: null,
    resetPasswordExpiresAt: null,
    passwordChangedAt: now,
    passwordResetReminderSentForMonth: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}

describe("runMonthlyPasswordResetReminderJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ignore les jours qui ne sont pas le dernier jour UTC du mois", async () => {
    const now = new Date(Date.UTC(2026, 3, 15));
    const r = await runMonthlyPasswordResetReminderJob({ now, appOrigin: "https://app.example" });
    expect(r.skipped).toBe(true);
    expect(r.reason).toBe("not_last_utc_day_of_month");
    expect(mocks.listUsersNeedingMonthlyPasswordResetReminder).not.toHaveBeenCalled();
  });

  it("envoie un e-mail et marque le mois le dernier jour UTC", async () => {
    const now = new Date(Date.UTC(2026, 3, 30));
    mocks.listUsersNeedingMonthlyPasswordResetReminder.mockResolvedValue([stubUser()]);
    mocks.sendSmtpEmail.mockResolvedValue({ sent: true });

    const r = await runMonthlyPasswordResetReminderJob({ now, appOrigin: "https://app.example" });

    expect(r.skipped).toBe(false);
    expect(r.endingMonthKey).toBe("2026-04");
    expect(r.candidates).toBe(1);
    expect(r.emailed).toBe(1);
    expect(mocks.setResetPasswordToken).toHaveBeenCalledTimes(1);
    expect(mocks.markPasswordResetReminderSentForMonth).toHaveBeenCalledWith("u1", "2026-04");
    expect(mocks.clearResetPasswordToken).not.toHaveBeenCalled();
    const [, subject, text] = mocks.sendSmtpEmail.mock.calls[0] ?? [];
    expect(subject).toContain("mot de passe");
    expect(text).toContain("https://app.example/login?resetToken=");
  });

  it("annule le token si l’e-mail n’est pas parti", async () => {
    const now = new Date(Date.UTC(2026, 3, 30));
    mocks.listUsersNeedingMonthlyPasswordResetReminder.mockResolvedValue([stubUser()]);
    mocks.sendSmtpEmail.mockResolvedValue({ sent: false, skippedReason: "Echec envoi SMTP" });

    const r = await runMonthlyPasswordResetReminderJob({ now, appOrigin: "https://x" });

    expect(r.emailed).toBe(0);
    expect(r.emailFailed).toBe(1);
    expect(mocks.clearResetPasswordToken).toHaveBeenCalledWith("u1");
    expect(mocks.markPasswordResetReminderSentForMonth).not.toHaveBeenCalled();
  });

  it("compte SMTP non configuré séparément", async () => {
    const now = new Date(Date.UTC(2026, 3, 30));
    mocks.listUsersNeedingMonthlyPasswordResetReminder.mockResolvedValue([stubUser()]);
    mocks.sendSmtpEmail.mockResolvedValue({
      sent: false,
      skippedReason: "SMTP non configure (SMTP_HOST / EMAIL_FROM)",
    });

    const r = await runMonthlyPasswordResetReminderJob({ now, appOrigin: "https://x" });

    expect(r.smtpNotConfigured).toBe(1);
    expect(r.emailFailed).toBe(0);
  });
});
