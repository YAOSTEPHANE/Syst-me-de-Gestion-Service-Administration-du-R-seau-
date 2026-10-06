import { describe, expect, it } from "vitest";

import {
  buildSoumissionStats,
  SOUMISSION_STATS_RANGE,
  soumissionStatsDelta,
  soumissionStatsWindowEnd,
  soumissionStatsWindowStart,
} from "@/lib/lonaci/soumission-stats";

// Lundi 5 octobre 2026, 13:00 UTC (semaine ISO 41).
const NOW = new Date("2026-10-05T13:00:00.000Z");

describe("buildSoumissionStats", () => {
  it("produit des séries de longueur fixe complétées par des zéros", () => {
    const stats = buildSoumissionStats({}, NOW);
    expect(stats.daily).toHaveLength(SOUMISSION_STATS_RANGE.days);
    expect(stats.weekly).toHaveLength(SOUMISSION_STATS_RANGE.weeks);
    expect(stats.monthly).toHaveLength(SOUMISSION_STATS_RANGE.months);
    expect(stats.daily.every((b) => b.count === 0)).toBe(true);
    expect(stats.totals).toMatchObject({ today: 0, thisWeek: 0, thisMonth: 0, averagePerDay: 0 });
  });

  it("place aujourd'hui en dernier et regroupe par semaine ISO (lundi) et par mois", () => {
    const stats = buildSoumissionStats(
      {
        "2026-10-05": 3, // lundi, semaine courante, mois courant
        "2026-10-04": 2, // dimanche, semaine précédente, mois courant
        "2026-09-28": 1, // lundi précédent, semaine précédente, septembre
        "2026-09-27": 4, // dimanche, semaine S39, septembre
      },
      NOW,
    );

    expect(stats.daily.at(-1)).toEqual({ key: "2026-10-05", label: "05/10", count: 3 });
    expect(stats.weekly.at(-1)).toMatchObject({ key: "2026-10-05", label: "S41 · 05/10", count: 3 });
    expect(stats.weekly.at(-2)).toMatchObject({ key: "2026-09-28", count: 3 });
    expect(stats.weekly.at(-3)).toMatchObject({ key: "2026-09-21", count: 4 });
    expect(stats.monthly.at(-1)).toMatchObject({ key: "2026-10", count: 5 });
    expect(stats.monthly.at(-2)).toMatchObject({ key: "2026-09", count: 5 });

    expect(stats.totals).toMatchObject({
      today: 3,
      yesterday: 2,
      thisWeek: 3,
      lastWeek: 3,
      thisMonth: 5,
      lastMonth: 5,
      averagePerDay: 0.3,
    });
  });

  it("couvre 12 mois de fenêtre et s'arrête au lendemain minuit", () => {
    expect(soumissionStatsWindowStart(NOW).toISOString()).toBe("2025-11-01T00:00:00.000Z");
    expect(soumissionStatsWindowEnd(NOW).toISOString()).toBe("2026-10-06T00:00:00.000Z");
  });
});

describe("soumissionStatsDelta", () => {
  it("calcule la variation en pourcentage", () => {
    expect(soumissionStatsDelta(15, 10)).toEqual({ label: "+50 %", direction: "up" });
    expect(soumissionStatsDelta(5, 10)).toEqual({ label: "-50 %", direction: "down" });
    expect(soumissionStatsDelta(7, 7)).toEqual({ label: "Stable", direction: "flat" });
    expect(soumissionStatsDelta(4, 0)).toEqual({ label: "+4", direction: "up" });
    expect(soumissionStatsDelta(1001, 1000)).toEqual({ label: "+<1 %", direction: "up" });
  });
});
