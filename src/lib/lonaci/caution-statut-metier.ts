import {
  CAUTION_PENDING_PAYMENT_STATUSES,
  CAUTION_STATUT_METIER_DESCRIPTIONS,
  CAUTION_STATUT_METIER_LABELS,
  type CautionStatutMetier,
} from "@/lib/lonaci/caution-statut-metier-constants";

export {
  CAUTION_PENDING_PAYMENT_STATUSES,
  CAUTION_STATUT_METIER_DESCRIPTIONS,
  CAUTION_STATUT_METIER_LABELS,
  CAUTION_STATUTS_METIER,
  type CautionStatutMetier,
} from "@/lib/lonaci/caution-statut-metier-constants";

export function isCautionPendingPayment(status: string): boolean {
  return (CAUTION_PENDING_PAYMENT_STATUSES as readonly string[]).includes(status);
}

export function resolveCautionStatutMetier(input: {
  status: string;
  dueDate: Date | string;
  overdueThresholdDate: Date;
}): CautionStatutMetier {
  const status = input.status.trim();
  if (status === "EXONEREE") return "EXONEREE";
  if (status === "PAYEE") return "PAYEE";

  if (isCautionPendingPayment(status)) {
    const due = input.dueDate instanceof Date ? input.dueDate : new Date(input.dueDate);
    if (!Number.isNaN(due.getTime()) && due.getTime() <= input.overdueThresholdDate.getTime()) {
      return "EN_RETARD";
    }
    return "EN_ATTENTE";
  }

  return "EN_ATTENTE";
}

export function cautionStatutMetierLabel(statut: CautionStatutMetier): string {
  return CAUTION_STATUT_METIER_LABELS[statut];
}

export function cautionStatutMetierDescription(statut: CautionStatutMetier): string {
  return CAUTION_STATUT_METIER_DESCRIPTIONS[statut];
}
