import { sendSmtpEmail } from "@/lib/email/smtp";
import { appendAuditLog } from "@/lib/lonaci/audit";

export interface RibDemandeNotifyResult {
  email: { sent: boolean; skippedReason?: string };
  sms: { sent: boolean; skippedReason?: string };
}

/**
 * Notifie le concessionnaire par courriel et/ou trace SMS afin qu’il fournisse son RIB.
 */
export async function notifyConcessionnaireRibDemande(input: {
  concessionnaireId: string;
  codePdv: string | null;
  nomComplet: string;
  email: string | null;
  telephone: string | null;
  actorUserId: string;
  channels: { email: boolean; sms: boolean };
}): Promise<RibDemandeNotifyResult> {
  const label = input.codePdv ? `${input.codePdv} — ${input.nomComplet}` : input.nomComplet;
  const subject = "LONACI — Demande de relevé d'identité bancaire (RIB)";
  const body = [
    `Bonjour ${input.nomComplet},`,
    "",
    "Une demande de RIB a été enregistrée pour votre point de vente LONACI.",
    "Merci de transmettre votre relevé d'identité bancaire à votre agence ou à votre interlocuteur habituel.",
    "",
    `Référence PDV : ${input.codePdv ?? "—"}`,
    "",
    "Cordialement,",
    "LONACI",
  ].join("\n");

  let emailResult: RibDemandeNotifyResult["email"] = { sent: false, skippedReason: "Canal non demandé" };
  if (input.channels.email) {
    if (input.email?.trim()) {
      emailResult = await sendSmtpEmail([input.email.trim()], subject, body);
    } else {
      emailResult = { sent: false, skippedReason: "Aucune adresse email sur la fiche" };
    }
  }

  let smsResult: RibDemandeNotifyResult["sms"] = { sent: false, skippedReason: "Canal non demandé" };
  if (input.channels.sms) {
    const tel = input.telephone?.trim();
    if (!tel) {
      smsResult = { sent: false, skippedReason: "Aucun téléphone sur la fiche" };
    } else if (!process.env.SMS_API_URL?.trim()) {
      smsResult = { sent: false, skippedReason: "SMS non configuré (SMS_API_URL)" };
      await appendAuditLog({
        entityType: "CONCESSIONNAIRE",
        entityId: input.concessionnaireId,
        action: "RIB_DEMANDE_SMS_PENDING",
        userId: input.actorUserId,
        details: { telephone: tel, messagePreview: body.slice(0, 200) },
      });
    } else {
      try {
        const res = await fetch(process.env.SMS_API_URL.trim(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to: tel, message: body.slice(0, 480) }),
        });
        smsResult = res.ok ? { sent: true } : { sent: false, skippedReason: `SMS API HTTP ${res.status}` };
      } catch {
        smsResult = { sent: false, skippedReason: "Échec appel SMS API" };
      }
    }
  }

  await appendAuditLog({
    entityType: "CONCESSIONNAIRE",
    entityId: input.concessionnaireId,
    action: "RIB_DEMANDE_NOTIF",
    userId: input.actorUserId,
    details: {
      label,
      email: emailResult,
      sms: smsResult,
    },
  });

  return { email: emailResult, sms: smsResult };
}
