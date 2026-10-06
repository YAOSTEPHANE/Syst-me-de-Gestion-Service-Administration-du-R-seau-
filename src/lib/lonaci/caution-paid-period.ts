/** Période de paiement des cautions (onglet « Payées »), bornes en jours calendaires locaux. */
export interface CautionPaidPeriod {
  from: Date | null;
  toExclusive: Date | null;
}

export const CAUTION_PAID_PRESETS = ["MOIS", "MOIS_PRECEDENT", "ANNEE", "TOUT"] as const;
export type CautionPaidPreset = (typeof CAUTION_PAID_PRESETS)[number];

export const CAUTION_PAID_PRESET_LABELS: Record<CautionPaidPreset, string> = {
  MOIS: "Ce mois",
  MOIS_PRECEDENT: "Mois précédent",
  ANNEE: "Cette année",
  TOUT: "Toute période",
};

export const ISO_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function parseIsoDay(value: string): Date | null {
  if (!ISO_DAY_PATTERN.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date;
}

export function formatIsoDay(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${m}-${d}`;
}

/** Sans aucune borne : mois en cours (comportement historique de l'onglet). */
export function resolveCautionPaidPeriod(
  input: { paidFrom?: string | null; paidTo?: string | null },
  today: Date = new Date(),
): CautionPaidPeriod {
  const from = input.paidFrom ? parseIsoDay(input.paidFrom) : null;
  const to = input.paidTo ? parseIsoDay(input.paidTo) : null;
  if (!from && !to) {
    return {
      from: new Date(today.getFullYear(), today.getMonth(), 1),
      toExclusive: new Date(today.getFullYear(), today.getMonth() + 1, 1),
    };
  }
  return {
    from,
    toExclusive: to ? new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1) : null,
  };
}

export function cautionPaidPeriodMongoRange(period: CautionPaidPeriod): Record<string, Date> {
  const range: Record<string, Date> = {};
  if (period.from) range.$gte = period.from;
  if (period.toExclusive) range.$lt = period.toExclusive;
  return range;
}

/** Bornes (AAAA-MM-JJ) d'un raccourci de période ; « TOUT » n'a pas de date de début. */
export function cautionPaidPresetRange(
  preset: CautionPaidPreset,
  today: Date = new Date(),
): { paidFrom: string; paidTo: string } {
  const y = today.getFullYear();
  const m = today.getMonth();
  switch (preset) {
    case "MOIS":
      return { paidFrom: formatIsoDay(new Date(y, m, 1)), paidTo: formatIsoDay(new Date(y, m + 1, 0)) };
    case "MOIS_PRECEDENT":
      return { paidFrom: formatIsoDay(new Date(y, m - 1, 1)), paidTo: formatIsoDay(new Date(y, m, 0)) };
    case "ANNEE":
      return { paidFrom: formatIsoDay(new Date(y, 0, 1)), paidTo: formatIsoDay(new Date(y, 11, 31)) };
    case "TOUT":
      return { paidFrom: "", paidTo: formatIsoDay(today) };
    default: {
      const exhaustive: never = preset;
      return exhaustive;
    }
  }
}
