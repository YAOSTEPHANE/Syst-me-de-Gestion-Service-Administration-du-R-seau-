"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ChartArea, ChartOptions, TooltipItem, TooltipOptions } from "chart.js";
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  RadialLinearScale,
  Tooltip,
} from "chart.js";
import { Bar, Doughnut, Line, Radar } from "react-chartjs-2";

import DashboardNotifications from "@/components/lonaci/dashboard-notifications";
import { useLonaciKpi } from "@/components/lonaci/lonaci-kpi-context";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  RadialLinearScale,
  Filler,
  Tooltip,
  Legend,
);

const DONUT_COLORS = ["#0ea5e9", "#14b8a6", "#d97706", "#8b5cf6", "#64748b"] as const;

const BAR_GRADIENTS = [
  { top: "#7dd3fc", bottom: "#0369a1" },
  { top: "#5eead4", bottom: "#0f766e" },
  { top: "#fde047", bottom: "#ca8a04" },
] as const;

function verticalGradient(
  ctx: CanvasRenderingContext2D,
  chartArea: ChartArea | undefined,
  top: string,
  bottom: string,
): CanvasGradient | string {
  if (!chartArea) return top;
  const g = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
  g.addColorStop(0, top);
  g.addColorStop(0.55, bottom);
  g.addColorStop(1, bottom);
  return g;
}

const PREMIUM_ANIMATION = {
  duration: 1450,
  easing: "easeOutCubic" as const,
};

const premiumTooltipDefaults = {
  backgroundColor: "rgba(15, 23, 42, 0.94)",
  titleColor: "#f8fafc",
  bodyColor: "#e2e8f0",
  borderColor: "rgba(125, 211, 252, 0.45)",
  borderWidth: 1,
  padding: 14,
  cornerRadius: 12,
  boxPadding: 6,
  displayColors: true,
  usePointStyle: true,
  titleMarginBottom: 6,
  bodySpacing: 5,
  titleFont: { size: 12, weight: "bold" },
  bodyFont: { size: 12 },
  caretSize: 8,
  caretPadding: 10,
} satisfies Partial<TooltipOptions<"bar">>;

function formatDelayHours(h: number): string {
  if (h <= 0) return "—";
  return `${h.toFixed(1).replace(".", ",")} h`;
}

function trendClass(pct: number): string {
  if (pct > 0) return "lonaci-db-trend-pos";
  if (pct < 0) return "lonaci-db-trend-neg";
  return "lonaci-db-trend-flat";
}

function formatTrendPct(pct: number): string {
  if (pct === 0) return "0 %";
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct} %`;
}

function produitLabel(code: string, libelle?: string): string {
  const cleanCode = (code || "—").trim();
  const cleanLibelle = (libelle || "").trim();
  if (cleanCode.toLowerCase() === "autres") return cleanCode;
  if (!cleanLibelle) return `${cleanCode} (non référencé)`;
  return `${cleanCode} - ${cleanLibelle}`;
}

export default function LonaciDashboardHome() {
  const { kpi, error, refresh } = useLonaciKpi();
  const [analyticsTheme, setAnalyticsTheme] = useState<"dark" | "light">(() => {
    if (typeof window === "undefined") return "dark";
    const raw = window.localStorage.getItem("lonaci:analytics-theme");
    return raw === "dark" || raw === "light" ? raw : "dark";
  });
  const analyticsThemeClass =
    analyticsTheme === "dark" ? "lonaci-db-analytics-card--dark" : "lonaci-db-analytics-card--light";
  const analyticsThemeLabel = analyticsTheme === "dark" ? "Dark executive" : "Clair premium";
  const [isCompactView, setIsCompactView] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const raw = window.localStorage.getItem("lonaci:dashboard:compact-view");
    if (raw === "1") return true;
    if (raw === "0") return false;
    return true;
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);

  useEffect(() => {
    window.localStorage.setItem("lonaci:analytics-theme", analyticsTheme);
  }, [analyticsTheme]);

  useEffect(() => {
    window.localStorage.setItem("lonaci:dashboard:compact-view", isCompactView ? "1" : "0");
  }, [isCompactView]);

  useEffect(() => {
    if (kpi) setLastRefreshedAt(new Date());
  }, [kpi]);

  async function handleRefreshDashboard() {
    setIsRefreshing(true);
    try {
      await refresh();
    } finally {
      setIsRefreshing(false);
    }
  }
  const topPdv = kpi?.topConcessionnairesActifs ?? [];
  const agencesTableRows = useMemo(() => {
    const list = kpi?.agencesOverview30j;
    if (!list?.length) return [];
    return [...list].sort((a, b) => {
      if (b.total30j !== a.total30j) return b.total30j - a.total30j;
      const ca = a.agenceCode ?? a.agenceLabel;
      const cb = b.agenceCode ?? b.agenceLabel;
      return ca.localeCompare(cb, "fr", { sensitivity: "base" });
    });
  }, [kpi]);
  const produitVol = useMemo(() => kpi?.produitVolumes30j ?? [], [kpi]);
  const productsToWatch = useMemo(
    () =>
      [...produitVol]
        .sort((a, b) => Math.abs(b.trendPct) - Math.abs(a.trendPct))
        .slice(0, 3),
    [produitVol],
  );
  const delays = kpi?.dossierDelays30j;

  const barDataPremium = useMemo(() => {
    const rows = kpi?.activity7d ?? [];
    const defs = [
      { label: "Contrats", pick: (r: (typeof rows)[number]) => r.contracts },
      { label: "Cautions", pick: (r: (typeof rows)[number]) => r.cautions },
      { label: "Intégrations", pick: (r: (typeof rows)[number]) => r.integrations },
    ] as const;
    return {
      labels: rows.map((r) => r.label),
      datasets: defs.map((d, j) => {
        const { top, bottom } = BAR_GRADIENTS[j] ?? BAR_GRADIENTS[0];
        return {
          label: d.label,
          data: rows.map((r) => d.pick(r)),
          borderRadius: { topLeft: 8, topRight: 8, bottomLeft: 2, bottomRight: 2 } as const,
          borderSkipped: false as const,
          maxBarThickness: 14,
          backgroundColor: (context: { chart: { ctx: CanvasRenderingContext2D; chartArea?: ChartArea } }) => {
            const { ctx, chartArea } = context.chart;
            return verticalGradient(ctx, chartArea, top, bottom);
          },
        };
      }),
    };
  }, [kpi]);

  const lineActivityData = useMemo(() => {
    const rows = kpi?.activity7d ?? [];
    return {
      labels: rows.map((r) => r.label),
      datasets: [
        {
          label: "Volume agrégé",
          data: rows.map((r) => r.contracts + r.cautions + r.integrations),
          fill: true,
          tension: 0.4,
          borderWidth: 2.75,
          pointRadius: 4,
          pointHoverRadius: 8,
          pointBackgroundColor: "#ffffff",
          pointBorderColor: "#0284c7",
          pointBorderWidth: 2,
          pointHoverBackgroundColor: "#0284c7",
          pointHoverBorderColor: "#ffffff",
          pointHoverBorderWidth: 2,
          borderColor: "#0284c7",
          backgroundColor: (context: { chart: { ctx: CanvasRenderingContext2D; chartArea?: ChartArea } }) => {
            const { ctx, chartArea } = context.chart;
            if (!chartArea) return "rgba(2, 132, 199, 0.08)";
            const g = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
            g.addColorStop(0, "rgba(2, 132, 199, 0.35)");
            g.addColorStop(0.5, "rgba(2, 132, 199, 0.1)");
            g.addColorStop(1, "rgba(255, 255, 255, 0)");
            return g;
          },
        },
      ],
    };
  }, [kpi]);

  const donutData = useMemo(() => {
    const slices = kpi?.produitSlices ?? [];
    return {
      labels: slices.map((s) => produitLabel(s.code, s.libelle)),
      datasets: [
        {
          data: slices.map((s) => s.count),
          backgroundColor: slices.map((_, i) => DONUT_COLORS[i % DONUT_COLORS.length]),
          borderWidth: 0,
          hoverOffset: 12,
          spacing: 2,
        },
      ],
    };
  }, [kpi]);

  const donutLegend = useMemo(() => {
    const slices = kpi?.produitSlices ?? [];
    const total = slices.reduce((s, x) => s + x.count, 0);
    if (total <= 0) return [];
    return slices.map((row) => ({
      code: row.code,
      label: produitLabel(row.code, row.libelle),
      pct: Math.round((row.count / total) * 100),
    }));
  }, [kpi]);

  const agenceVolumeData = useMemo(() => {
    const rows = agencesTableRows.slice(0, 6);
    return {
      labels: rows.map((r) => r.agenceCode ?? r.agenceLabel),
      datasets: [
        {
          label: "Volume 30 j.",
          data: rows.map((r) => r.total30j),
          borderRadius: 10,
          borderSkipped: false as const,
          backgroundColor: (context: { chart: { ctx: CanvasRenderingContext2D; chartArea?: ChartArea } }) => {
            const { ctx, chartArea } = context.chart;
            return verticalGradient(ctx, chartArea, "#38bdf8", "#0369a1");
          },
        },
      ],
    };
  }, [agencesTableRows]);

  const agenceVolumeOptions = useMemo<ChartOptions<"bar">>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: "y",
      animation: PREMIUM_ANIMATION,
      plugins: {
        legend: { display: false },
        tooltip: { ...premiumTooltipDefaults },
      },
      scales: {
        x: {
          beginAtZero: true,
          border: { display: false },
          grid: { color: "rgba(148, 163, 184, 0.16)" },
          ticks: { color: "#94a3b8", font: { size: 10 } },
        },
        y: {
          border: { display: false },
          grid: { display: false },
          ticks: { color: "#64748b", font: { size: 10 } },
        },
      },
    }),
    [],
  );

  const delaysRadarData = useMemo(() => {
    const d = delays;
    const values = d
      ? [d.avgSubmitHours, d.avgN1Hours, d.avgN2Hours, d.avgFinalizeHours].map((v) =>
          Number.isFinite(v) ? Number(v.toFixed(1)) : 0,
        )
      : [0, 0, 0, 0];
    return {
      labels: ["Soumission", "Validation N1", "Validation N2", "Finalisation"],
      datasets: [
        {
          label: "Heures moyennes",
          data: values,
          borderColor: "#0ea5e9",
          backgroundColor: "rgba(14, 165, 233, 0.2)",
          pointBackgroundColor: "#0284c7",
          pointBorderColor: "#ffffff",
          pointHoverBackgroundColor: "#0369a1",
          pointBorderWidth: 2,
        },
      ],
    };
  }, [delays]);

  const delaysRadarOptions = useMemo<ChartOptions<"radar">>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: PREMIUM_ANIMATION,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...premiumTooltipDefaults,
          callbacks: {
            label: (ctx) => {
              const n = typeof ctx.raw === "number" ? ctx.raw : Number(ctx.raw) || 0;
              return ` ${n.toFixed(1).replace(".", ",")} h`;
            },
          },
        },
      },
      scales: {
        r: {
          beginAtZero: true,
          angleLines: { color: "rgba(148, 163, 184, 0.2)" },
          grid: { color: "rgba(148, 163, 184, 0.2)" },
          pointLabels: { color: "#475569", font: { size: 11 } },
          ticks: { display: false },
        },
      },
    }),
    [],
  );

  const modulePressureData = useMemo(() => {
    const validation = kpi?.dossierValidation;
    const pending = validation
      ? [
          validation.contratSoumis,
          validation.cautionsEnAttente,
          validation.pdvNonFinalise,
          validation.agrementsEnAttente,
          validation.successionOuverts,
        ]
      : [0, 0, 0, 0, 0];
    const overdue = validation
      ? [
          validation.contratSoumisRetard48h,
          validation.cautionsJ10,
          validation.pdvEnCoursRetard5j,
          validation.agrementsRetard,
          validation.successionStale30j,
        ]
      : [0, 0, 0, 0, 0];
    return {
      labels: ["Contrats", "Cautions", "PDV", "Agréments", "Successions"],
      datasets: [
        {
          label: "En attente",
          data: pending,
          borderRadius: 8,
          borderSkipped: false as const,
          maxBarThickness: 20,
          backgroundColor: (context: { chart: { ctx: CanvasRenderingContext2D; chartArea?: ChartArea } }) => {
            const { ctx, chartArea } = context.chart;
            return verticalGradient(ctx, chartArea, "#7dd3fc", "#0284c7");
          },
        },
        {
          label: "En retard",
          data: overdue,
          borderRadius: 8,
          borderSkipped: false as const,
          maxBarThickness: 20,
          backgroundColor: (context: { chart: { ctx: CanvasRenderingContext2D; chartArea?: ChartArea } }) => {
            const { ctx, chartArea } = context.chart;
            return verticalGradient(ctx, chartArea, "#fda4af", "#dc2626");
          },
        },
      ],
    };
  }, [kpi]);

  const modulePressureOptions = useMemo<ChartOptions<"bar">>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: PREMIUM_ANIMATION,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          display: true,
          position: "bottom",
          labels: { boxWidth: 10, color: "#475569", usePointStyle: true, pointStyle: "circle", padding: 14 },
        },
        tooltip: { ...premiumTooltipDefaults },
      },
      datasets: {
        bar: { barPercentage: 0.72, categoryPercentage: 0.68 },
      },
      scales: {
        x: {
          stacked: true,
          grid: { display: false },
          ticks: { color: "#64748b", font: { size: 10 } },
          border: { display: false },
        },
        y: {
          stacked: true,
          beginAtZero: true,
          grid: { color: "rgba(148, 163, 184, 0.16)" },
          ticks: { color: "#94a3b8", font: { size: 10 } },
          border: { display: false },
        },
      },
    }),
    [],
  );

  const modulePressureSummary = useMemo(() => {
    const v = kpi?.dossierValidation;
    if (!v) return { pending: 0, overdue: 0 };
    const pending =
      v.contratSoumis + v.cautionsEnAttente + v.pdvNonFinalise + v.agrementsEnAttente + v.successionOuverts;
    const overdue =
      v.contratSoumisRetard48h + v.cautionsJ10 + v.pdvEnCoursRetard5j + v.agrementsRetard + v.successionStale30j;
    return { pending, overdue };
  }, [kpi]);

  const productTopRows = useMemo(
    () =>
      [...produitVol]
        .sort((a, b) => {
          if (b.current30d !== a.current30d) return b.current30d - a.current30d;
          return a.produitCode.localeCompare(b.produitCode, "fr", { sensitivity: "base" });
        })
        .slice(0, 6),
    [produitVol],
  );

  const productComparisonData = useMemo(() => {
    const rows = productTopRows;
    return {
      labels: rows.map((p) => p.produitCode),
      datasets: [
        {
          label: "30 j. courant",
          data: rows.map((p) => p.current30d),
          borderRadius: 8,
          borderSkipped: false as const,
          maxBarThickness: 20,
          backgroundColor: (context: { chart: { ctx: CanvasRenderingContext2D; chartArea?: ChartArea } }) => {
            const { ctx, chartArea } = context.chart;
            return verticalGradient(ctx, chartArea, "#7dd3fc", "#0284c7");
          },
        },
        {
          label: "30 j. précédents",
          data: rows.map((p) => p.previous30d),
          borderRadius: 8,
          borderSkipped: false as const,
          maxBarThickness: 20,
          backgroundColor: (context: { chart: { ctx: CanvasRenderingContext2D; chartArea?: ChartArea } }) => {
            const { ctx, chartArea } = context.chart;
            return verticalGradient(ctx, chartArea, "#cbd5e1", "#64748b");
          },
        },
      ],
    };
  }, [productTopRows]);

  const productComparisonOptions = useMemo<ChartOptions<"bar">>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: PREMIUM_ANIMATION,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          display: true,
          position: "bottom",
          labels: { boxWidth: 10, color: "#475569", usePointStyle: true, pointStyle: "rectRounded", padding: 14 },
        },
        tooltip: {
          ...premiumTooltipDefaults,
          callbacks: {
            title: (items: TooltipItem<"bar">[]) => {
              if (!items.length) return "";
              const row = productTopRows[items[0].dataIndex];
              return row ? produitLabel(row.produitCode, row.produitLibelle) : String(items[0].label ?? "");
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: "#64748b", font: { size: 10 } },
          border: { display: false },
        },
        y: {
          beginAtZero: true,
          grid: { color: "rgba(148, 163, 184, 0.16)" },
          ticks: { color: "#94a3b8", font: { size: 10 } },
          border: { display: false },
        },
      },
      datasets: {
        bar: { barPercentage: 0.72, categoryPercentage: 0.66 },
      },
    }),
    [productTopRows],
  );

  const productTopSummary = useMemo(() => {
    const current = productTopRows.reduce((sum, row) => sum + row.current30d, 0);
    const previous = productTopRows.reduce((sum, row) => sum + row.previous30d, 0);
    const delta = current - previous;
    return { current, previous, delta };
  }, [productTopRows]);

  const barChartOptions = useMemo<ChartOptions<"bar">>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      animation: PREMIUM_ANIMATION,
      datasets: {
        bar: {
          barPercentage: 0.85,
          categoryPercentage: 0.74,
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...premiumTooltipDefaults,
          callbacks: {
            footer: (items: TooltipItem<"bar">[]) => {
              if (!items.length) return "";
              const sum = items.reduce((s, it) => s + (Number(it.parsed.y) || 0), 0);
              return `Total : ${sum}`;
            },
          },
        },
      },
      scales: {
        x: {
          stacked: false,
          grid: { display: false, drawTicks: true },
          ticks: { font: { size: 10 }, color: "#64748b", padding: 8 },
          border: { display: false },
        },
        y: {
          beginAtZero: true,
          border: { display: false },
          grid: { color: "rgba(148, 163, 184, 0.18)", lineWidth: 1 },
          ticks: { font: { size: 10 }, color: "#94a3b8", padding: 10 },
        },
      },
    }),
    [],
  );

  const lineChartOptions = useMemo<ChartOptions<"line">>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      animation: PREMIUM_ANIMATION,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...premiumTooltipDefaults,
          callbacks: {
            label: (ctx: TooltipItem<"line">) => {
              const v = ctx.parsed.y;
              const n = typeof v === "number" ? v : 0;
              return ` ${n} événement${n > 1 ? "s" : ""}`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { size: 10 }, color: "#64748b", padding: 8 },
          border: { display: false },
        },
        y: {
          beginAtZero: true,
          border: { display: false },
          grid: { color: "rgba(148, 163, 184, 0.16)" },
          ticks: { font: { size: 10 }, color: "#94a3b8", padding: 8 },
        },
      },
      elements: {
        line: { borderCapStyle: "round", borderJoinStyle: "round" },
        point: { hoverBorderWidth: 2 },
      },
    }),
    [],
  );

  const donutChartOptions = useMemo<ChartOptions<"doughnut">>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      cutout: "68%",
      rotation: -88,
      circumference: 360,
      animation: { ...PREMIUM_ANIMATION, animateRotate: true },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...premiumTooltipDefaults,
          callbacks: {
            label: (ctx: TooltipItem<"doughnut">) => {
              const raw = ctx.raw;
              const n = typeof raw === "number" ? raw : Number(raw) || 0;
              const arr = ctx.dataset.data as number[];
              const total = arr.reduce((a, b) => a + b, 0);
              const pct = total > 0 ? Math.round((n / total) * 100) : 0;
              return ` ${String(ctx.label)} : ${n} (${pct}%)`;
            },
          },
        },
      },
      elements: {
        arc: {
          borderWidth: 5,
          borderColor: "#ffffff",
          hoverBorderWidth: 4,
          hoverBorderColor: "#ffffff",
        },
      },
    }),
    [],
  );

  const totalPending = kpi
    ? kpi.dossierValidation.contratSoumis +
      kpi.dossierValidation.cautionsEnAttente +
      kpi.dossierValidation.pdvNonFinalise +
      kpi.dossierValidation.agrementsEnAttente +
      kpi.dossierValidation.successionOuverts
    : 0;
  const urgentCount = kpi
    ? kpi.dossierValidation.cautionsJ10 +
      kpi.dossierValidation.successionStale30j +
      kpi.dossierValidation.contratSoumisRetard48h +
      kpi.dossierValidation.pdvEnCoursRetard5j +
      kpi.dossierValidation.agrementsRetard
    : 0;

  const th = kpi?.alertThresholds;
  const cautionDays = th?.cautionMaxDays ?? 10;
  const idleHours = th?.dossierIdleHours ?? 48;
  const pdvDays = th?.pdvIntegrationMaxDays ?? 5;
  const pendingContracts =
    (kpi?.dossierValidation?.contratSoumis ?? 0) + (kpi?.dossierValidation?.contratSoumisRetard48h ?? 0);
  const finalisationRate = kpi
    ? Math.round((kpi.weekly.contrats.createdInWindow / Math.max(1, kpi.weekly.contrats.createdInWindow + pendingContracts)) * 100)
    : 0;
  const totalActifReseau = kpi?.daily?.concessionnaires?.byStatut?.ACTIF ?? 0;
  const contratsToday = kpi?.weekly?.contrats?.createdInWindow ?? 0;
  const cautionsToday = kpi?.daily?.cautions?.enAttente ?? 0;
  const pdvToday = kpi?.daily?.pdvIntegrations?.nonFinalise ?? 0;

  return (
    <div className="lonaci-db-dashboard lonaci-db-dashboard--premium space-y-5">
      <DashboardNotifications />
      {error ? <p className="lonaci-db-dashboard--premium__error">{error}</p> : null}

      {!kpi && !error ? (
        <div className="lonaci-db-prem-skeleton" aria-busy aria-label="Chargement du tableau de bord">
          <div className="lonaci-db-prem-skeleton-hero">
            <div className="lonaci-db-prem-skel-line lonaci-db-prem-skel-line--lg" />
            <div className="lonaci-db-prem-skel-line lonaci-db-prem-skel-line--md" />
            <div className="lonaci-db-prem-skeleton-stats">
              <div className="lonaci-db-prem-skel-block" />
              <div className="lonaci-db-prem-skel-block" />
              <div className="lonaci-db-prem-skel-block" />
              <div className="lonaci-db-prem-skel-block" />
            </div>
          </div>
          <div className="lonaci-db-prem-skeleton-grid">
            <div className="lonaci-db-prem-skel-block lonaci-db-prem-skel-block--tall" />
            <div className="lonaci-db-prem-skel-block lonaci-db-prem-skel-block--tall" />
            <div className="lonaci-db-prem-skel-block lonaci-db-prem-skel-block--tall" />
            <div className="lonaci-db-prem-skel-block lonaci-db-prem-skel-block--tall" />
          </div>
        </div>
      ) : null}

      {kpi ? (
        <>
          <div className="lonaci-db-analytics-global-toggle-wrap">
            <div className="flex flex-wrap items-center gap-2">
              <span className="lonaci-db-analytics-global-toggle-label">Thème analytics</span>
              <button
                type="button"
                className="lonaci-db-analytics-theme-toggle"
                onClick={() => setAnalyticsTheme((prev) => (prev === "dark" ? "light" : "dark"))}
                aria-label="Basculer le thème analytics"
                title="Basculer le thème analytics"
              >
                {analyticsThemeLabel}
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="lonaci-db-analytics-theme-toggle"
                onClick={() => setIsCompactView((prev) => !prev)}
                aria-label="Basculer la densité du tableau de bord"
                title="Basculer la densité du tableau de bord"
              >
                {isCompactView ? "Vue complète" : "Vue compacte"}
              </button>
              <button
                type="button"
                className="lonaci-db-analytics-theme-toggle"
                onClick={() => void handleRefreshDashboard()}
                disabled={isRefreshing}
                aria-label="Rafraîchir les données du tableau de bord"
                title="Rafraîchir les données du tableau de bord"
              >
                {isRefreshing ? "Rafraîchissement..." : "Rafraîchir"}
              </button>
              <span className="text-[11px] text-slate-500">
                {lastRefreshedAt ? `Maj: ${lastRefreshedAt.toLocaleTimeString("fr-FR")}` : "Maj: —"}
              </span>
            </div>
          </div>

          <section className="lonaci-db-prem-hero" aria-labelledby="lonaci-prem-hero-title">
            <div className="lonaci-db-prem-hero__mesh" aria-hidden />
            <div className="lonaci-db-prem-hero__inner">
              <div className="lonaci-db-prem-hero__intro">
                <p className="lonaci-db-prem-eyebrow">Executive overview</p>
                <h1 id="lonaci-prem-hero-title" className="lonaci-db-prem-hero__title">
                  Pilotage opérations
                </h1>
                <p className="lonaci-db-prem-hero__lede">
                  Contrats, cautions, intégrations PDV et signaux critiques — vue consolidée du réseau en temps réel.
                </p>
              </div>
              <div className="lonaci-db-prem-hero__stats" role="group" aria-label="Indicateurs clés">
                <div className="lonaci-db-prem-stat">
                  <span className="lonaci-db-prem-stat__label">Finalisation</span>
                  <span className="lonaci-db-prem-stat__value">{finalisationRate}%</span>
                  <span className="lonaci-db-prem-stat__hint">contrats</span>
                </div>
                <div className="lonaci-db-prem-stat">
                  <span className="lonaci-db-prem-stat__label">PDV actifs</span>
                  <span className="lonaci-db-prem-stat__value">{totalActifReseau}</span>
                  <span className="lonaci-db-prem-stat__hint">réseau</span>
                </div>
                <div className="lonaci-db-prem-stat lonaci-db-prem-stat--alert">
                  <span className="lonaci-db-prem-stat__label">Urgences</span>
                  <span className="lonaci-db-prem-stat__value">{urgentCount}</span>
                  <span className="lonaci-db-prem-stat__hint">à traiter</span>
                </div>
                <div className="lonaci-db-prem-stat">
                  <span className="lonaci-db-prem-stat__label">En attente</span>
                  <span className="lonaci-db-prem-stat__value">{totalPending}</span>
                  <span className="lonaci-db-prem-stat__hint">dossiers</span>
                </div>
              </div>
            </div>
            <nav className="lonaci-db-prem-hero__actions" aria-label="Raccourcis modules">
              <Link href="/contrats" className="lonaci-db-prem-pill">
                Contrats
                <span className="lonaci-db-prem-pill__meta">{contratsToday}</span>
              </Link>
              <Link href="/cautions" className="lonaci-db-prem-pill">
                Cautions
                <span className="lonaci-db-prem-pill__meta">{cautionsToday}</span>
              </Link>
              <Link href="/pdv-integrations" className="lonaci-db-prem-pill">
                Intégrations
                <span className="lonaci-db-prem-pill__meta">{pdvToday}</span>
              </Link>
              <Link href="/alertes" className="lonaci-db-prem-pill lonaci-db-prem-pill--danger">
                Alertes critiques
              </Link>
            </nav>
          </section>

          <div className="lonaci-db-kpi-grid">
            <div className="lonaci-db-kpi">
              <div className="lonaci-db-kpi-head">
                <div className="lonaci-db-kpi-label">Contrats signés</div>
                <div className="lonaci-db-icon-box lonaci-db-icon-box-blue">
                  <svg width="14" height="14" fill="none" stroke="#1D4ED8" strokeWidth={1.7} viewBox="0 0 24 24">
                    <path d="M14 2H7a2 2 0 00-2 2v16a2 2 0 002 2h10a2 2 0 002-2V8z" />
                    <path d="M14 2v6h6M9 13h6M9 17h6M9 9h2" />
                  </svg>
                </div>
              </div>
              <div className="lonaci-db-kpi-value">{kpi.weekly.contrats.createdInWindow}</div>
              <div className="lonaci-db-mt-7">
                {kpi.weekly.contrats.createdInWindow > 0 ? (
                  <span className="lonaci-db-badge lonaci-db-badge-green">
                    +{kpi.weekly.contrats.createdInWindow} cette semaine
                  </span>
                ) : (
                  <span className="lonaci-db-badge lonaci-db-badge-blue">Aucun cette semaine</span>
                )}
              </div>
              <div className="lonaci-db-pbr">
                <div className="lonaci-db-pbf lonaci-db-pbf-blue lonaci-db-pbf-w-60" />
              </div>
              <div className="lonaci-db-kpi-foot lonaci-db-flex-between">
                <span>Objectif : {kpi.contractsMonthlyTarget ?? 20} / mois</span>
                <Link href="/contrats" className="lonaci-db-abtn lonaci-db-abtn-ghost">
                  Ouvrir
                </Link>
              </div>
            </div>

            <div className="lonaci-db-kpi">
              <div className="lonaci-db-kpi-head">
                <div className="lonaci-db-kpi-label">Cautions en attente</div>
                <div className="lonaci-db-icon-box lonaci-db-icon-box-amber">
                  <svg width="14" height="14" fill="none" stroke="#B45309" strokeWidth={1.7} viewBox="0 0 24 24">
                    <circle cx="12" cy="13" r="8" />
                    <path d="M12 9v4l2.5 2.5M9 2h6M12 2v3" />
                  </svg>
                </div>
              </div>
              <div className="lonaci-db-kpi-value">{kpi.daily.cautions.enAttente}</div>
              <div className="lonaci-db-mt-7">
                <span className="lonaci-db-badge lonaci-db-badge-red">
                  {kpi.cautionsJ10} dépassée{kpi.cautionsJ10 > 1 ? "s" : ""} J+{cautionDays}
                </span>
              </div>
              <div className="lonaci-db-pbr">
                <div className="lonaci-db-pbf lonaci-db-pbf-amber lonaci-db-pbf-w-30" />
              </div>
              <div className="lonaci-db-kpi-foot lonaci-db-flex-between">
                <span>{kpi.daily.cautions.enAttente} en attente de validation</span>
                <Link href="/cautions?tab=EN_ATTENTE" className="lonaci-db-abtn lonaci-db-abtn-ghost">
                  Ouvrir
                </Link>
              </div>
            </div>

            <div className="lonaci-db-kpi">
              <div className="lonaci-db-kpi-head">
                <div className="lonaci-db-kpi-label">Géolocalisation PDV</div>
                <div className="lonaci-db-icon-box lonaci-db-icon-box-green">
                  <svg width="14" height="14" fill="none" stroke="#047857" strokeWidth={1.7} viewBox="0 0 24 24">
                    <path d="M12 21s-6-5.2-6-10a6 6 0 1112 0c0 4.8-6 10-6 10z" />
                    <circle cx="12" cy="11" r="2.2" />
                  </svg>
                </div>
              </div>
              <div className="lonaci-db-kpi-value">{kpi.daily.pdvIntegrations.nonFinalise}</div>
              <div className="lonaci-db-mt-7">
                <span className="lonaci-db-badge lonaci-db-badge-blue">en traitement</span>
              </div>
              <div className="lonaci-db-pbr">
                <div className="lonaci-db-pbf lonaci-db-pbf-green lonaci-db-pbf-w-50" />
              </div>
              <div className="lonaci-db-kpi-foot lonaci-db-flex-between">
                <span>
                  {kpi.dossierValidation.pdvEnCoursRetard5j === 0
                    ? "0 en retard"
                    : `${kpi.dossierValidation.pdvEnCoursRetard5j} intégration(s) > ${pdvDays} j.`}
                </span>
                <Link href="/pdv-integrations?status=EN_TRAITEMENT" className="lonaci-db-abtn lonaci-db-abtn-ghost">
                  Ouvrir
                </Link>
              </div>
            </div>

            <div className="lonaci-db-kpi">
              <div className="lonaci-db-kpi-head">
                <div className="lonaci-db-kpi-label">Concessionnaires actifs</div>
                <div className="lonaci-db-icon-box lonaci-db-icon-box-violet">
                  <svg width="14" height="14" fill="none" stroke="#6D28D9" strokeWidth={1.7} viewBox="0 0 24 24">
                    <path d="M16 19v-1a4 4 0 00-4-4H6a4 4 0 00-4 4v1" />
                    <circle cx="9" cy="7" r="3" />
                    <path d="M22 19v-1a4 4 0 00-3-3.87M16 4.13a3 3 0 010 5.74" />
                  </svg>
                </div>
              </div>
              <div className="lonaci-db-kpi-value">{kpi.daily.concessionnaires.byStatut.ACTIF ?? 0}</div>
              <div className="lonaci-db-mt-7">
                <span className="lonaci-db-badge lonaci-db-badge-green">reseau actif</span>
              </div>
              <div className="lonaci-db-pbr">
                <div className="lonaci-db-pbf lonaci-db-pbf-violet lonaci-db-pbf-w-80" />
              </div>
              <div className="lonaci-db-kpi-foot lonaci-db-flex-between">
                <span>Sur le réseau ({kpi.daily.concessionnaires.total ?? 0} PDV)</span>
                <Link href="/concessionnaires" className="lonaci-db-abtn lonaci-db-abtn-ghost">
                  Ouvrir
                </Link>
              </div>
            </div>
          </div>

          <div className="lonaci-db-row-2">
            <div className={`lonaci-db-kpi lonaci-db-analytics-card ${analyticsThemeClass}`}>
              <div className="lonaci-db-flex-between lonaci-db-mb-14">
                <div>
                  <div className="lonaci-db-section-title">Activité — 7 derniers jours</div>
                  <div className="lonaci-db-section-subtitle">
                    Barres en dégradé · courbe de volume agrégé · infobulles détaillées
                  </div>
                </div>
                <div className="lonaci-db-chart-legend">
                  <span>
                    <span className="lonaci-db-chart-legend-swatch lonaci-db-chart-legend-swatch-contract" /> Contrats
                  </span>
                  <span>
                    <span className="lonaci-db-chart-legend-swatch lonaci-db-chart-legend-swatch-caution" /> Cautions
                  </span>
                  <span>
                    <span className="lonaci-db-chart-legend-swatch lonaci-db-chart-legend-swatch-pdv" /> Intégrations
                  </span>
                </div>
              </div>
              <div className="lonaci-db-prem-chart-split">
                <div className="lonaci-db-prem-chart-panel lonaci-db-prem-chart-panel--ultra">
                  <p className="lonaci-db-prem-chart-panel-title">Répartition par canal</p>
                  <div className="lonaci-db-chart-wrap lonaci-db-chart-wrap--premium-bar lonaci-db-chart-wrap--ultra">
                    <Bar data={barDataPremium} options={barChartOptions} />
                  </div>
                </div>
                <div className="lonaci-db-prem-chart-panel lonaci-db-prem-chart-panel--ultra">
                  <p className="lonaci-db-prem-chart-panel-title">Dynamique cumulée</p>
                  <div className="lonaci-db-chart-wrap lonaci-db-chart-wrap--premium-line lonaci-db-chart-wrap--ultra">
                    <Line data={lineActivityData} options={lineChartOptions} />
                  </div>
                </div>
              </div>
            </div>

            <div className="lonaci-db-kpi lonaci-db-alerts">
              <div className="lonaci-db-flex-between lonaci-db-mb-12">
                <div className="lonaci-db-section-title">Alertes actives</div>
                <span className="lonaci-db-badge lonaci-db-badge-red">{urgentCount} urgentes</span>
              </div>
              <div className="lonaci-db-alr lonaci-db-alr-red lonaci-db-alr-row">
                <div className="lonaci-db-dot lonaci-db-dot-red" />
                <div className="lonaci-db-alr-grow">
                  <div className="lonaci-db-alr-title lonaci-db-text-red-900">Cautions impayées J+{cautionDays}</div>
                  <div className="lonaci-db-alr-sub lonaci-db-text-red-700">{kpi.cautionsJ10} dossier(s)</div>
                </div>
                <Link href="/cautions?tab=J10_OVERDUE" className="lonaci-db-abtn lonaci-db-abtn-red lonaci-db-alr-actions">
                  Voir
                </Link>
              </div>
              <div className="lonaci-db-alr lonaci-db-alr-red lonaci-db-mt-neg-2 lonaci-db-alr-row">
                <div className="lonaci-db-dot lonaci-db-dot-red" />
                <div className="lonaci-db-alr-grow">
                  <div className="lonaci-db-alr-title lonaci-db-text-red-900">Succession sans action</div>
                  <div className="lonaci-db-alr-sub lonaci-db-text-red-700">
                    {kpi.successionStaleItems[0]?.reference ?? "Aucune"} · {kpi.successionStale} cas
                  </div>
                </div>
                <Link href="/succession?status=OUVERT&staleOnly=1" className="lonaci-db-abtn lonaci-db-abtn-red lonaci-db-alr-actions">
                  Voir
                </Link>
              </div>
              <div className="lonaci-db-alr lonaci-db-alr-amber lonaci-db-mt-neg-2 lonaci-db-alr-row">
                <div className="lonaci-db-dot lonaci-db-dot-amber" />
                <div className="lonaci-db-alr-grow">
                  <div className="lonaci-db-alr-title lonaci-db-text-amber-900">Dossiers sans action {idleHours}h</div>
                  <div className="lonaci-db-alr-sub lonaci-db-text-amber-700">
                    {kpi.dossierValidation.contratSoumisRetard48h} en attente validation N1
                  </div>
                </div>
                <Link href="/dossiers?status=SOUMIS" className="lonaci-db-abtn lonaci-db-abtn-ghost lonaci-db-alr-actions">
                  Voir
                </Link>
              </div>
              {kpi.dossierValidation.pdvEnCoursRetard5j > 0 ? (
                <div className="lonaci-db-alr lonaci-db-alr-amber lonaci-db-mt-neg-2 lonaci-db-alr-row">
                  <div className="lonaci-db-dot lonaci-db-dot-amber" />
                  <div className="lonaci-db-alr-grow">
                    <div className="lonaci-db-alr-title lonaci-db-text-amber-900">
                      Intégration PDV {'>'} {pdvDays} jour{pdvDays > 1 ? "s" : ""}
                    </div>
                    <div className="lonaci-db-alr-sub lonaci-db-text-amber-700">
                      {kpi.dossierValidation.pdvEnCoursRetard5j} demande(s) en traitement
                    </div>
                  </div>
                  <Link href="/pdv-integrations?status=EN_TRAITEMENT" className="lonaci-db-abtn lonaci-db-abtn-ghost lonaci-db-alr-actions">
                    Voir
                  </Link>
                </div>
              ) : null}
              <div className="lonaci-db-alerts-footer">
                <Link href="/alertes" className="lonaci-db-abtn lonaci-db-abtn-ghost-full">
                  Voir toutes les alertes ↗
                </Link>
              </div>
            </div>
          </div>

          {!isCompactView ? (
            <>
          <div className="lonaci-db-row-insights-equal">
            <div className="lonaci-db-kpi lonaci-db-insight-card lonaci-db-insight-card--lift lonaci-db-insight-card--delay-1">
              <div className="lonaci-db-flex-between lonaci-db-mb-12">
                <div>
                  <div className="lonaci-db-section-title">Top PDV</div>
                  <div className="lonaci-db-section-subtitle">Contrats actifs par concessionnaire</div>
                </div>
                <Link href="/concessionnaires" className="lonaci-db-abtn lonaci-db-abtn-ghost lonaci-db-alr-actions">
                  Réseau
                </Link>
              </div>
              <div className="lonaci-db-top-grid">
                {topPdv.length === 0 ? (
                  <p className="lonaci-db-muted lonaci-db-fs-10">Aucun contrat actif répertorié.</p>
                ) : (
                  topPdv.map((row, i) => (
                    <div key={row.concessionnaireId || `pdv-${i}`} className="lonaci-db-top-item">
                      <div>
                        <div className="lonaci-db-top-name">{row.nomComplet}</div>
                        <div className="lonaci-db-top-code">{row.codePdv}</div>
                      </div>
                      <div className="lonaci-db-top-right">
                        <div className="lonaci-db-top-value">{row.contratsActifs}</div>
                        <div className="lonaci-db-top-sub">contrats</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="lonaci-db-kpi lonaci-db-insight-card lonaci-db-insight-card--lift lonaci-db-insight-card--delay-2">
              <div className="lonaci-db-mb-12">
                <div className="lonaci-db-section-title">Délais moyens (dossiers)</div>
                <div className="lonaci-db-section-subtitle">
                  30 derniers jours
                  {delays ? ` · ${delays.sampleSize} dossier(s) créé(s)` : null}
                </div>
              </div>
              {!delays || delays.sampleSize === 0 ? (
                <p className="lonaci-db-muted lonaci-db-fs-10">Pas assez de données sur la période.</p>
              ) : (
                <div className="lonaci-db-delay-grid">
                  <div>
                    <div className="lonaci-db-delay-value lonaci-db-delay-blue">{formatDelayHours(delays.avgSubmitHours)}</div>
                    <div className="lonaci-db-delay-label lonaci-db-delay-blue-sub">Jusqu&apos;à soumission</div>
                  </div>
                  <div>
                    <div className="lonaci-db-delay-value lonaci-db-delay-amber">{formatDelayHours(delays.avgN1Hours)}</div>
                    <div className="lonaci-db-delay-label lonaci-db-delay-amber-sub">Jusqu&apos;à validation N1</div>
                  </div>
                  <div>
                    <div className="lonaci-db-delay-value lonaci-db-delay-violet">{formatDelayHours(delays.avgN2Hours)}</div>
                    <div className="lonaci-db-delay-label lonaci-db-delay-violet-sub">Jusqu&apos;à validation N2</div>
                  </div>
                  <div>
                    <div className="lonaci-db-delay-value lonaci-db-delay-green">{formatDelayHours(delays.avgFinalizeHours)}</div>
                    <div className="lonaci-db-delay-label lonaci-db-delay-green-sub">Jusqu&apos;à finalisation</div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="lonaci-db-row-insights-equal">
            <div
              className={`lonaci-db-kpi lonaci-db-insight-card lonaci-db-insight-card--lift lonaci-db-insight-card--delay-3 lonaci-db-analytics-card ${analyticsThemeClass}`}
            >
              <div className="lonaci-db-mb-12">
                <div className="lonaci-db-section-title">Top agences par volume</div>
                <div className="lonaci-db-section-subtitle">Contrats + cautions + integrations sur 30 jours</div>
              </div>
              {agencesTableRows.length === 0 ? (
                <p className="lonaci-db-muted lonaci-db-fs-10">Aucune agence avec activité sur la période.</p>
              ) : (
                <div className="lonaci-db-chart-wrap lonaci-db-chart-wrap--insight lonaci-db-chart-wrap--ultra">
                  <Bar data={agenceVolumeData} options={agenceVolumeOptions} />
                </div>
              )}
            </div>

            <div
              className={`lonaci-db-kpi lonaci-db-insight-card lonaci-db-insight-card--lift lonaci-db-insight-card--delay-4 lonaci-db-analytics-card ${analyticsThemeClass}`}
            >
              <div className="lonaci-db-mb-12">
                <div className="lonaci-db-section-title">Profil des délais</div>
                <div className="lonaci-db-section-subtitle">Visualisation radar des étapes de traitement</div>
              </div>
              {!delays || delays.sampleSize === 0 ? (
                <p className="lonaci-db-muted lonaci-db-fs-10">Pas assez de données sur la période.</p>
              ) : (
                <div className="lonaci-db-chart-wrap lonaci-db-chart-wrap--insight lonaci-db-chart-wrap--ultra">
                  <Radar data={delaysRadarData} options={delaysRadarOptions} />
                </div>
              )}
            </div>
          </div>

          <div className="lonaci-db-row-insights-equal">
            <div
              className={`lonaci-db-kpi lonaci-db-insight-card lonaci-db-insight-card--lift lonaci-db-insight-card--delay-5 lonaci-db-analytics-card ${analyticsThemeClass}`}
            >
              <div className="lonaci-db-mb-12">
                <div className="lonaci-db-section-title">Pression opérationnelle</div>
                <div className="lonaci-db-section-subtitle">En attente vs retard par module</div>
              </div>
              <div className="lonaci-db-insight-metrics">
                <span className="lonaci-db-insight-metric-chip lonaci-db-insight-metric-chip--info">
                  En attente: {modulePressureSummary.pending}
                </span>
                <span className="lonaci-db-insight-metric-chip lonaci-db-insight-metric-chip--danger">
                  En retard: {modulePressureSummary.overdue}
                </span>
              </div>
              <div className="lonaci-db-chart-wrap lonaci-db-chart-wrap--insight lonaci-db-chart-wrap--glass lonaci-db-chart-wrap--ultra">
                <Bar data={modulePressureData} options={modulePressureOptions} />
              </div>
            </div>

            <div
              className={`lonaci-db-kpi lonaci-db-insight-card lonaci-db-insight-card--lift lonaci-db-insight-card--delay-6 lonaci-db-analytics-card ${analyticsThemeClass}`}
            >
              <div className="lonaci-db-mb-12">
                <div className="lonaci-db-section-title">Performance produits</div>
                <div className="lonaci-db-section-subtitle">Top 6 · 30 j. courant vs 30 j. précédents</div>
              </div>
              <div className="lonaci-db-insight-metrics">
                <span className="lonaci-db-insight-metric-chip lonaci-db-insight-metric-chip--info">
                  30 j. courant: {productTopSummary.current}
                </span>
                <span className="lonaci-db-insight-metric-chip lonaci-db-insight-metric-chip--neutral">
                  30 j. préc.: {productTopSummary.previous}
                </span>
                <span
                  className={`lonaci-db-insight-metric-chip ${
                    productTopSummary.delta >= 0
                      ? "lonaci-db-insight-metric-chip--success"
                      : "lonaci-db-insight-metric-chip--danger"
                  }`}
                >
                  Delta: {productTopSummary.delta >= 0 ? "+" : ""}
                  {productTopSummary.delta}
                </span>
              </div>
              {productTopRows.length === 0 ? (
                <p className="lonaci-db-muted lonaci-db-fs-10">Aucune activité produit sur la période.</p>
              ) : (
                <div className="lonaci-db-chart-wrap lonaci-db-chart-wrap--insight lonaci-db-chart-wrap--glass lonaci-db-chart-wrap--ultra">
                  <Bar data={productComparisonData} options={productComparisonOptions} />
                </div>
              )}
            </div>
          </div>

          <div className="lonaci-db-kpi lonaci-db-mb-14">
            <div className="lonaci-db-flex-between lonaci-db-mb-12">
              <div>
                <div className="lonaci-db-section-title">Tendances par agence</div>
                <div className="lonaci-db-section-subtitle">
                  Toutes les agences · 30 j. · tri par volume (contrats, cautions, intégrations PDV)
                </div>
              </div>
            </div>
            <div className="lonaci-db-mini-table-wrap">
              {agencesTableRows.length === 0 ? (
                <p className="lonaci-db-muted lonaci-db-fs-10">Aucune agence dans le référentiel.</p>
              ) : (
                <table className="lonaci-db-mini-table">
                  <thead>
                    <tr>
                      <th>Agence</th>
                      <th className="lonaci-db-th-num">Contrats</th>
                      <th className="lonaci-db-th-num">Cautions</th>
                      <th className="lonaci-db-th-num">Int.</th>
                      <th className="lonaci-db-th-num">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agencesTableRows.map((a, i) => (
                      <tr key={a.agenceId ?? `ag-${i}`}>
                        <td>
                          {a.agenceId ? (
                            <Link href={`/concessionnaires?agenceId=${encodeURIComponent(a.agenceId)}`}>
                              {a.agenceLabel}
                            </Link>
                          ) : (
                            a.agenceLabel
                          )}
                        </td>
                        <td className="lonaci-db-td-num">
                          {a.agenceId ? (
                            <Link href={`/contrats?agenceId=${encodeURIComponent(a.agenceId)}`}>{a.contrats30j}</Link>
                          ) : (
                            a.contrats30j
                          )}
                        </td>
                        <td className="lonaci-db-td-num">{a.cautions30j}</td>
                        <td className="lonaci-db-td-num">
                          {a.agenceId ? (
                            <Link href={`/pdv-integrations?agenceId=${encodeURIComponent(a.agenceId)}`}>
                              {a.integrations30j}
                            </Link>
                          ) : (
                            a.integrations30j
                          )}
                        </td>
                        <td className="lonaci-db-td-num">
                          <strong>{a.total30j}</strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="lonaci-db-kpi lonaci-db-mb-14">
            <div className="lonaci-db-mb-12">
              <div className="lonaci-db-section-title">Contrats par produit (30 j.)</div>
              <div className="lonaci-db-section-subtitle">Glissement vs les 30 j. précédents</div>
            </div>
            <div className="lonaci-db-mini-table-wrap">
              {produitVol.length === 0 ? (
                <p className="lonaci-db-muted lonaci-db-fs-10">Aucun contrat sur les périodes comparées.</p>
              ) : (
                <table className="lonaci-db-mini-table">
                  <thead>
                    <tr>
                      <th>Produit</th>
                      <th className="lonaci-db-th-num">30 j.</th>
                      <th className="lonaci-db-th-num">30 j. préc.</th>
                      <th className="lonaci-db-th-num">Évol.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {produitVol.map((p, i) => (
                      <tr key={p.produitCode || `pr-${i}`}>
                        <td>
                          <Link href={`/contrats?produitCode=${encodeURIComponent(p.produitCode)}`}>
                            {produitLabel(p.produitCode, p.produitLibelle)}
                          </Link>
                        </td>
                        <td className="lonaci-db-td-num">
                          <Link href={`/contrats?produitCode=${encodeURIComponent(p.produitCode)}`}>{p.current30d}</Link>
                        </td>
                        <td className="lonaci-db-td-num">{p.previous30d}</td>
                        <td className={`lonaci-db-td-num ${trendClass(p.trendPct)}`}>{formatTrendPct(p.trendPct)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="lonaci-db-products-watch">
              <div className="lonaci-db-products-watch__title">Top 3 produits à surveiller</div>
              {productsToWatch.length === 0 ? (
                <p className="lonaci-db-muted lonaci-db-fs-10">Aucune variation notable sur la période.</p>
              ) : (
                <div className="lonaci-db-products-watch__grid">
                  {productsToWatch.map((row) => (
                    <article key={`watch-${row.produitCode}`} className="lonaci-db-products-watch__card">
                      <p className="lonaci-db-products-watch__name">{produitLabel(row.produitCode, row.produitLibelle)}</p>
                      <p className="lonaci-db-products-watch__meta">
                        30 j.: <strong>{row.current30d}</strong> · préc.: <strong>{row.previous30d}</strong>
                      </p>
                      <p className={`lonaci-db-products-watch__trend ${trendClass(row.trendPct)}`}>
                        {row.trendPct >= 0 ? "Hausse" : "Baisse"} {formatTrendPct(row.trendPct)}
                      </p>
                      <Link href={`/contrats?produitCode=${encodeURIComponent(row.produitCode)}`} className="lonaci-db-abtn lonaci-db-abtn-ghost">
                        Ouvrir
                      </Link>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </div>
            </>
          ) : null}

          <div className="lonaci-db-row-bottom">
            <div className="lonaci-db-kpi lonaci-db-pending-validation">
              <div className="lonaci-db-table-head">
                <div className="lonaci-db-section-title">Dossiers en attente de validation</div>
                <span className="lonaci-db-badge lonaci-db-badge-blue">{totalPending} total</span>
              </div>
              <div className="lonaci-db-pending-list">
                <div className="lonaci-db-pending-head" aria-hidden>
                  <span>Module</span>
                  <span className="lonaci-db-pending-head-num">Attente</span>
                  <span className="lonaci-db-pending-head-num">Retard</span>
                  <span className="lonaci-db-pending-head-act">Action</span>
                </div>
                <div className="lonaci-db-pending-row">
                  <div className="lonaci-db-pending-module">
                    <div className="lonaci-db-cell-title">Contrats &amp; Actualisations</div>
                    <div className="lonaci-db-cell-sub">Validation N1 requise</div>
                  </div>
                  <div className="lonaci-db-pending-metric">
                    <span className="lonaci-db-pending-metric-label">En attente</span>
                    <span className="lonaci-db-pending-metric-val lonaci-db-pending-val-blue">{kpi.dossierValidation.contratSoumis}</span>
                  </div>
                  <div className="lonaci-db-pending-metric">
                    <span className="lonaci-db-pending-metric-label">En retard</span>
                    <span className="lonaci-db-badge lonaci-db-badge-red">{kpi.dossierValidation.contratSoumisRetard48h}</span>
                  </div>
                  <div className="lonaci-db-pending-action">
                    <Link href="/dossiers?status=SOUMIS" className="lonaci-db-abtn lonaci-db-abtn-blue">
                      Valider N1
                    </Link>
                  </div>
                </div>
                <div className="lonaci-db-pending-row">
                  <div className="lonaci-db-pending-module">
                    <div className="lonaci-db-cell-title">Cautions</div>
                    <div className="lonaci-db-cell-sub">Validation finale</div>
                  </div>
                  <div className="lonaci-db-pending-metric">
                    <span className="lonaci-db-pending-metric-label">En attente</span>
                    <span className="lonaci-db-pending-metric-val lonaci-db-pending-val-blue">{kpi.dossierValidation.cautionsEnAttente}</span>
                  </div>
                  <div className="lonaci-db-pending-metric">
                    <span className="lonaci-db-pending-metric-label">En retard</span>
                    <span className="lonaci-db-badge lonaci-db-badge-red">{kpi.dossierValidation.cautionsJ10}</span>
                  </div>
                  <div className="lonaci-db-pending-action">
                    <Link href="/cautions?tab=J10_OVERDUE" className="lonaci-db-abtn lonaci-db-abtn-red">
                      Urgent
                    </Link>
                  </div>
                </div>
                <div className="lonaci-db-pending-row">
                  <div className="lonaci-db-pending-module">
                    <div className="lonaci-db-cell-title">Géolocalisation PDV</div>
                    <div className="lonaci-db-cell-sub">Finalisation</div>
                  </div>
                  <div className="lonaci-db-pending-metric">
                    <span className="lonaci-db-pending-metric-label">En attente</span>
                    <span className="lonaci-db-pending-metric-val lonaci-db-pending-val-blue">{kpi.dossierValidation.pdvNonFinalise}</span>
                  </div>
                  <div className="lonaci-db-pending-metric">
                    <span className="lonaci-db-pending-metric-label">En retard</span>
                    {kpi.dossierValidation.pdvEnCoursRetard5j > 0 ? (
                      <span className="lonaci-db-badge lonaci-db-badge-red">
                        {kpi.dossierValidation.pdvEnCoursRetard5j}
                      </span>
                    ) : (
                      <span className="lonaci-db-muted">—</span>
                    )}
                  </div>
                  <div className="lonaci-db-pending-action">
                    <Link href="/pdv-integrations?status=EN_TRAITEMENT" className="lonaci-db-abtn lonaci-db-abtn-green">
                      Finaliser
                    </Link>
                  </div>
                </div>
                <div className="lonaci-db-pending-row">
                  <div className="lonaci-db-pending-module">
                    <div className="lonaci-db-cell-title">Agréments</div>
                    <div className="lonaci-db-cell-sub">Contrôle N2</div>
                  </div>
                  <div className="lonaci-db-pending-metric">
                    <span className="lonaci-db-pending-metric-label">En attente</span>
                    <span className="lonaci-db-pending-metric-val lonaci-db-pending-val-blue">{kpi.dossierValidation.agrementsEnAttente}</span>
                  </div>
                  <div className="lonaci-db-pending-metric">
                    <span className="lonaci-db-pending-metric-label">En retard</span>
                    {kpi.dossierValidation.agrementsRetard > 0 ? (
                      <span className="lonaci-db-badge lonaci-db-badge-red">{kpi.dossierValidation.agrementsRetard}</span>
                    ) : (
                      <span className="lonaci-db-muted">—</span>
                    )}
                  </div>
                  <div className="lonaci-db-pending-action">
                    <Link href="/agrements" className="lonaci-db-abtn lonaci-db-abtn-ghost">
                      Contrôler
                    </Link>
                  </div>
                </div>
                <div className="lonaci-db-pending-row lonaci-db-pending-row-last">
                  <div className="lonaci-db-pending-module">
                    <div className="lonaci-db-cell-title">Décès et ayants droit</div>
                    <div className="lonaci-db-cell-sub">Décision finale</div>
                  </div>
                  <div className="lonaci-db-pending-metric">
                    <span className="lonaci-db-pending-metric-label">En attente</span>
                    <span className="lonaci-db-pending-metric-val lonaci-db-pending-val-blue">{kpi.dossierValidation.successionOuverts}</span>
                  </div>
                  <div className="lonaci-db-pending-metric">
                    <span className="lonaci-db-pending-metric-label">En retard</span>
                    <span className="lonaci-db-badge lonaci-db-badge-red">{kpi.dossierValidation.successionStale30j}</span>
                  </div>
                  <div className="lonaci-db-pending-action">
                    <Link href="/succession?status=OUVERT&staleOnly=1" className="lonaci-db-abtn lonaci-db-abtn-red">
                      Décision
                    </Link>
                  </div>
                </div>
              </div>
            </div>

            <div className={`lonaci-db-kpi lonaci-db-flex-col lonaci-db-analytics-card ${analyticsThemeClass}`}>
              <div className="lonaci-db-section-title lonaci-db-mb-3">Répartition par produit</div>
              <div className="lonaci-db-section-subtitle lonaci-db-mb-12">Contrats actifs · mois courant</div>
              <div className="lonaci-db-donut-wrap lonaci-db-donut-wrap--premium lonaci-db-donut-wrap--ultra">
                <Doughnut data={donutData} options={donutChartOptions} />
              </div>
              <div className="lonaci-db-donut-legend">
                {donutLegend.map((row, idx) => (
                  <div
                    key={row.code}
                    className={`lonaci-db-donut-legend-row lonaci-db-donut-legend-tone-${idx % DONUT_COLORS.length}`}
                  >
                    <span className="lonaci-db-donut-legend-dot" />
                    {row.label} <strong>{row.pct}%</strong>
                  </div>
                ))}
              </div>
              <div className="lonaci-db-bancarisation-wrap">
                <div className="lonaci-db-flex-between lonaci-db-mb-8">
                  <div className="lonaci-db-bancarisation-title">Bancarisation</div>
                  <Link href="/bancarisation" className="lonaci-db-abtn lonaci-db-abtn-ghost lonaci-db-alr-actions">
                    Détail
                  </Link>
                </div>
                <div className="lonaci-db-bank-grid">
                  <div className="lonaci-db-bank-cell lonaci-db-cell-red-lite">
                    <div className="lonaci-db-bank-value lonaci-db-bank-red">{kpi.bancarisation.nonBancarise}</div>
                    <div className="lonaci-db-bank-sub lonaci-db-bank-red-sub">Non banc.</div>
                  </div>
                  <div className="lonaci-db-bank-cell lonaci-db-cell-amber-lite">
                    <div className="lonaci-db-bank-value lonaci-db-bank-amber">{kpi.bancarisation.enCours}</div>
                    <div className="lonaci-db-bank-sub lonaci-db-bank-amber-sub">En cours</div>
                  </div>
                  <div className="lonaci-db-bank-cell lonaci-db-cell-green-lite">
                    <div className="lonaci-db-bank-value lonaci-db-bank-green">{kpi.bancarisation.bancarise}</div>
                    <div className="lonaci-db-bank-sub lonaci-db-bank-green-sub">Bancarisés</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
