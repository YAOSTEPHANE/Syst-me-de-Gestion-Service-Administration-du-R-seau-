"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, CalendarRange, CalendarClock, Gauge } from "lucide-react";
import type { ScriptableContext } from "chart.js";
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip,
} from "chart.js";
import { Bar } from "react-chartjs-2";

import { registerPremiumChartPlugins } from "@/lib/lonaci/premium-chart-plugins";
import {
  barVerticalGradientScriptable,
  premiumBarOptions,
  withExecutiveOverlays,
} from "@/lib/lonaci/premium-charts";
import type { SoumissionStatut } from "@/lib/lonaci/soumission-constants";
import {
  SOUMISSION_STATS_RANGE,
  soumissionStatsDelta,
  type SoumissionStatsBucket,
  type SoumissionStatsDelta,
  type SoumissionStatsGranularity,
  type SoumissionStatsPayload,
} from "@/lib/lonaci/soumission-stats";
import type { Tone } from "@/components/lonaci/ui/badge";
import { AnimatedMetric } from "@/components/lonaci/ui/animated-metric";
import { ChartCard, KpiCard } from "@/components/lonaci/ui/dashboard-cards";
import { FeedbackState, Skeleton } from "@/components/lonaci/ui/feedback-state";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);
registerPremiumChartPlugins(ChartJS);

export interface SoumissionsStatsProps {
  agenceId: string;
  produitCode: string;
  statut: "" | SoumissionStatut;
  appele: "" | "true" | "false";
  q: string;
  /** À incrémenter après une création / un import pour recharger les volumes. */
  refreshKey: number;
}

const GRANULARITY_OPTIONS: Array<{
  value: SoumissionStatsGranularity;
  label: string;
  description: string;
}> = [
  { value: "day", label: "Jour", description: `${SOUMISSION_STATS_RANGE.days} derniers jours` },
  { value: "week", label: "Semaine", description: `${SOUMISSION_STATS_RANGE.weeks} dernières semaines` },
  { value: "month", label: "Mois", description: `${SOUMISSION_STATS_RANGE.months} derniers mois` },
];

const PERIOD_NOUN: Record<SoumissionStatsGranularity, string> = {
  day: "jour",
  week: "semaine",
  month: "mois",
};

const pastBars = barVerticalGradientScriptable("#fdba74", "#c2410c");
const currentBar = barVerticalGradientScriptable("#5eead4", "#0f766e");

function deltaTone(delta: SoumissionStatsDelta): Tone {
  switch (delta.direction) {
    case "up":
      return "success";
    case "down":
      return "danger";
    case "flat":
      return "neutral";
    default: {
      const exhaustive: never = delta.direction;
      return exhaustive;
    }
  }
}

function soumissionsLabel(n: number): string {
  return `${n.toLocaleString("fr-FR")} soumission${n > 1 ? "s" : ""}`;
}

function bucketsFor(
  stats: SoumissionStatsPayload,
  granularity: SoumissionStatsGranularity,
): SoumissionStatsBucket[] {
  switch (granularity) {
    case "day":
      return stats.daily;
    case "week":
      return stats.weekly;
    case "month":
      return stats.monthly;
    default: {
      const exhaustive: never = granularity;
      return exhaustive;
    }
  }
}

export function SoumissionsStats({
  agenceId,
  produitCode,
  statut,
  appele,
  q,
  refreshKey,
}: SoumissionsStatsProps) {
  const [stats, setStats] = useState<SoumissionStatsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [granularity, setGranularity] = useState<SoumissionStatsGranularity>("day");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (agenceId.trim()) params.set("agenceId", agenceId.trim());
    if (produitCode.trim()) params.set("produitCode", produitCode.trim().toUpperCase());
    if (statut) params.set("statut", statut);
    if (appele) params.set("appele", appele);
    if (q.trim()) params.set("q", q.trim());
    void (async () => {
      try {
        const res = await fetch(`/api/soumissions/stats?${params}`, {
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("Statistiques indisponibles pour le moment.");
        setStats((await res.json()) as SoumissionStatsPayload);
      } catch (e) {
        if (controller.signal.aborted) return;
        setError(e instanceof Error ? e.message : "Statistiques indisponibles pour le moment.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [agenceId, produitCode, statut, appele, q, refreshKey]);

  const buckets = useMemo(
    () => (stats ? bucketsFor(stats, granularity) : []),
    [stats, granularity],
  );

  const summary = useMemo(() => {
    const total = buckets.reduce((sum, b) => sum + b.count, 0);
    const peak = buckets.reduce<SoumissionStatsBucket | null>(
      (best, b) => (b.count > 0 && (!best || b.count > best.count) ? b : best),
      null,
    );
    return { total, peak };
  }, [buckets]);

  const chartData = useMemo(() => {
    const lastIndex = buckets.length - 1;
    return {
      labels: buckets.map((b) => b.label),
      datasets: [
        {
          label: "Soumissions",
          data: buckets.map((b) => b.count),
          borderRadius: 10,
          borderSkipped: false as const,
          backgroundColor: (ctx: ScriptableContext<"bar">) =>
            ctx.dataIndex === lastIndex ? currentBar(ctx) : pastBars(ctx),
        },
      ],
    };
  }, [buckets]);

  const chartOptions = useMemo(
    () =>
      withExecutiveOverlays(
        premiumBarOptions({
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const n = typeof ctx.parsed.y === "number" ? ctx.parsed.y : 0;
                  return ` ${soumissionsLabel(n)}`;
                },
              },
            },
          },
        }),
      ),
    [],
  );

  if (error && !stats) {
    return <FeedbackState tone="danger" title="Statistiques indisponibles" description={error} />;
  }

  if (!stats) {
    return <Skeleton lines={4} />;
  }

  const { totals } = stats;
  const todayDelta = soumissionStatsDelta(totals.today, totals.yesterday);
  const weekDelta = soumissionStatsDelta(totals.thisWeek, totals.lastWeek);
  const monthDelta = soumissionStatsDelta(totals.thisMonth, totals.lastMonth);
  const activeOption =
    GRANULARITY_OPTIONS.find((o) => o.value === granularity) ?? GRANULARITY_OPTIONS[0]!;

  return (
    <section
      aria-label="Statistiques des soumissions"
      aria-busy={loading}
      className={`space-y-4 transition-opacity ${loading ? "opacity-70" : ""}`}
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          className="lonaci-ui-kpi-card--animated"
          label="Aujourd'hui"
          value={<AnimatedMetric value={totals.today} />}
          detail={`Hier : ${totals.yesterday.toLocaleString("fr-FR")}`}
          trend={{ label: todayDelta.label, tone: deltaTone(todayDelta) }}
          icon={CalendarClock}
        />
        <KpiCard
          className="lonaci-ui-kpi-card--animated"
          label="Cette semaine"
          value={<AnimatedMetric value={totals.thisWeek} />}
          detail={`Sem. précédente : ${totals.lastWeek.toLocaleString("fr-FR")}`}
          trend={{ label: weekDelta.label, tone: deltaTone(weekDelta) }}
          icon={CalendarRange}
        />
        <KpiCard
          className="lonaci-ui-kpi-card--animated"
          label="Ce mois"
          value={<AnimatedMetric value={totals.thisMonth} />}
          detail={`Mois précédent : ${totals.lastMonth.toLocaleString("fr-FR")}`}
          trend={{ label: monthDelta.label, tone: deltaTone(monthDelta) }}
          icon={CalendarDays}
        />
        <KpiCard
          className="lonaci-ui-kpi-card--animated"
          label="Moyenne / jour"
          value={<AnimatedMetric value={totals.averagePerDay} decimals={1} />}
          detail={`Sur ${SOUMISSION_STATS_RANGE.days} jours`}
          icon={Gauge}
        />
      </div>

      <ChartCard
        ultra
        badge={activeOption.label}
        title={`Soumissions par ${PERIOD_NOUN[granularity]}`}
        description={`${activeOption.description} · ${soumissionsLabel(summary.total)}${
          summary.peak ? ` · pic ${summary.peak.label} (${summary.peak.count.toLocaleString("fr-FR")})` : ""
        }`}
        action={
          <div
            role="group"
            aria-label="Granularité des statistiques"
            className="inline-flex rounded-lg border border-slate-200/80 bg-white/80 p-0.5 text-[11px] font-semibold shadow-sm"
          >
            {GRANULARITY_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={granularity === option.value}
                onClick={() => setGranularity(option.value)}
                className={`rounded-md px-2.5 py-1 transition ${
                  granularity === option.value ? "bg-orange-100 text-orange-900" : "text-slate-500"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        }
        legend={
          <span className="inline-flex flex-wrap items-center gap-4 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-orange-500" aria-hidden="true" />
              Périodes passées
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-teal-600" aria-hidden="true" />
              Période en cours
            </span>
          </span>
        }
      >
        <div className="h-[280px]">
          <Bar data={chartData} options={chartOptions} />
        </div>
      </ChartCard>
    </section>
  );
}
