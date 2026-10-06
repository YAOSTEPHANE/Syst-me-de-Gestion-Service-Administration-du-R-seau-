/**
 * Statistiques de volume des soumissions (par jour, semaine ISO, mois).
 * Les clés sont calculées en UTC : la Côte d'Ivoire (Africa/Abidjan) est à UTC+0.
 */

export const SOUMISSION_STATS_RANGE = {
  days: 30,
  weeks: 12,
  months: 12,
} as const;

export type SoumissionStatsGranularity = "day" | "week" | "month";

export type SoumissionStatsBucket = {
  /** `YYYY-MM-DD` (jour, ou lundi de la semaine) ou `YYYY-MM` (mois). */
  key: string;
  label: string;
  count: number;
};

export type SoumissionStatsTotals = {
  today: number;
  yesterday: number;
  thisWeek: number;
  lastWeek: number;
  thisMonth: number;
  lastMonth: number;
  /** Moyenne quotidienne sur la fenêtre `SOUMISSION_STATS_RANGE.days`. */
  averagePerDay: number;
};

export type SoumissionStatsPayload = {
  generatedAt: string;
  totals: SoumissionStatsTotals;
  daily: SoumissionStatsBucket[];
  weekly: SoumissionStatsBucket[];
  monthly: SoumissionStatsBucket[];
};

export type SoumissionStatsDelta = {
  label: string;
  direction: "up" | "down" | "flat";
};

const DAY_MS = 86_400_000;

const MONTH_LABEL = new Intl.DateTimeFormat("fr-FR", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function startOfIsoWeek(date: Date): Date {
  const day = startOfUtcDay(date);
  const offsetFromMonday = (day.getUTCDay() + 6) % 7;
  return new Date(day.getTime() - offsetFromMonday * DAY_MS);
}

function startOfUtcMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function addUtcMonths(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

export function soumissionStatsDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function monthKey(date: Date): string {
  return date.toISOString().slice(0, 7);
}

function isoWeekNumber(date: Date): number {
  const thursday = new Date(startOfIsoWeek(date).getTime() + 3 * DAY_MS);
  const yearStart = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  return Math.floor((thursday.getTime() - yearStart) / DAY_MS / 7) + 1;
}

function dayLabel(date: Date): string {
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}`;
}

/** Début (inclus) de la fenêtre à agréger : couvre les 12 mois et donc les 30 jours / 12 semaines. */
export function soumissionStatsWindowStart(now: Date): Date {
  const monthsStart = addUtcMonths(startOfUtcMonth(now), -(SOUMISSION_STATS_RANGE.months - 1));
  const weeksStart = new Date(
    startOfIsoWeek(now).getTime() - (SOUMISSION_STATS_RANGE.weeks - 1) * 7 * DAY_MS,
  );
  return monthsStart < weeksStart ? monthsStart : weeksStart;
}

/** Fin (exclue) de la fenêtre : lendemain de `now` à minuit UTC. */
export function soumissionStatsWindowEnd(now: Date): Date {
  return new Date(startOfUtcDay(now).getTime() + DAY_MS);
}

/**
 * Construit les séries jour / semaine / mois à partir des comptes quotidiens
 * (`YYYY-MM-DD` → nombre), en complétant les périodes sans soumission par 0.
 */
export function buildSoumissionStats(
  dailyCounts: Readonly<Record<string, number>>,
  now: Date,
): SoumissionStatsPayload {
  const today = startOfUtcDay(now);

  const countForDays = (from: Date, toExclusive: Date): number => {
    let sum = 0;
    for (let t = from.getTime(); t < toExclusive.getTime(); t += DAY_MS) {
      sum += dailyCounts[soumissionStatsDayKey(new Date(t))] ?? 0;
    }
    return sum;
  };

  const daily: SoumissionStatsBucket[] = [];
  for (let i = SOUMISSION_STATS_RANGE.days - 1; i >= 0; i -= 1) {
    const day = new Date(today.getTime() - i * DAY_MS);
    const key = soumissionStatsDayKey(day);
    daily.push({ key, label: dayLabel(day), count: dailyCounts[key] ?? 0 });
  }

  const currentWeek = startOfIsoWeek(now);
  const weekly: SoumissionStatsBucket[] = [];
  for (let i = SOUMISSION_STATS_RANGE.weeks - 1; i >= 0; i -= 1) {
    const weekStart = new Date(currentWeek.getTime() - i * 7 * DAY_MS);
    const weekEnd = new Date(weekStart.getTime() + 7 * DAY_MS);
    weekly.push({
      key: soumissionStatsDayKey(weekStart),
      label: `S${isoWeekNumber(weekStart)} · ${dayLabel(weekStart)}`,
      count: countForDays(weekStart, weekEnd),
    });
  }

  const currentMonth = startOfUtcMonth(now);
  const monthly: SoumissionStatsBucket[] = [];
  for (let i = SOUMISSION_STATS_RANGE.months - 1; i >= 0; i -= 1) {
    const monthStart = addUtcMonths(currentMonth, -i);
    monthly.push({
      key: monthKey(monthStart),
      label: MONTH_LABEL.format(monthStart),
      count: countForDays(monthStart, addUtcMonths(monthStart, 1)),
    });
  }

  const dailySum = daily.reduce((sum, bucket) => sum + bucket.count, 0);

  return {
    generatedAt: now.toISOString(),
    totals: {
      today: daily.at(-1)?.count ?? 0,
      yesterday: daily.at(-2)?.count ?? 0,
      thisWeek: weekly.at(-1)?.count ?? 0,
      lastWeek: weekly.at(-2)?.count ?? 0,
      thisMonth: monthly.at(-1)?.count ?? 0,
      lastMonth: monthly.at(-2)?.count ?? 0,
      averagePerDay: Math.round((dailySum / SOUMISSION_STATS_RANGE.days) * 10) / 10,
    },
    daily,
    weekly,
    monthly,
  };
}

/** Variation d'une période par rapport à la précédente, prête à afficher. */
export function soumissionStatsDelta(current: number, previous: number): SoumissionStatsDelta {
  if (current === previous) return { label: "Stable", direction: "flat" };
  if (previous === 0) return { label: `+${current}`, direction: "up" };
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) {
    return current > previous
      ? { label: "+<1 %", direction: "up" }
      : { label: "-<1 %", direction: "down" };
  }
  return pct > 0
    ? { label: `+${pct} %`, direction: "up" }
    : { label: `${pct} %`, direction: "down" };
}
