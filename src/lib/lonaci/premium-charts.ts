import type { ChartArea, ChartOptions, ScriptableContext, TooltipOptions } from "chart.js";

/** Palette LONACI institutionnelle (orange / navy / teal / amber). */
export const PREMIUM_PALETTE = [
  "#f97316",
  "#0f766e",
  "#1e3a5f",
  "#eab308",
  "#ef4444",
  "#64748b",
  "#14b8a6",
  "#c2410c",
] as const;

export const PREMIUM_BAR_GRADIENTS = [
  { top: "#fdba74", bottom: "#c2410c" },
  { top: "#5eead4", bottom: "#0f766e" },
  { top: "#fde047", bottom: "#ca8a04" },
  { top: "#93c5fd", bottom: "#1e3a5f" },
  { top: "#fda4af", bottom: "#be123c" },
  { top: "#cbd5e1", bottom: "#475569" },
] as const;

export const PREMIUM_ANIMATION = {
  duration: 1600,
  easing: "easeOutQuart" as const,
};

export const PREMIUM_ANIMATION_STAGGER = {
  duration: 1450,
  easing: "easeOutCubic" as const,
  delay: (ctx: { dataIndex: number }) => ctx.dataIndex * 55,
};

export const premiumTooltipDefaults = {
  backgroundColor: "rgba(15, 23, 42, 0.94)",
  titleColor: "#f8fafc",
  bodyColor: "#e2e8f0",
  borderColor: "rgba(249, 115, 22, 0.45)",
  borderWidth: 1,
  padding: 14,
  cornerRadius: 12,
  boxPadding: 6,
  displayColors: true,
  usePointStyle: true,
  titleMarginBottom: 6,
  bodySpacing: 5,
  titleFont: { size: 12, weight: "bold" as const },
  bodyFont: { size: 12 },
  caretSize: 8,
  caretPadding: 10,
} satisfies Partial<TooltipOptions<"bar">>;

export function verticalGradient(
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

export function horizontalGradient(
  ctx: CanvasRenderingContext2D,
  chartArea: ChartArea | undefined,
  left: string,
  right: string,
): CanvasGradient | string {
  if (!chartArea) return left;
  const g = ctx.createLinearGradient(chartArea.left, 0, chartArea.right, 0);
  g.addColorStop(0, left);
  g.addColorStop(1, right);
  return g;
}

export function areaFillGradient(
  ctx: CanvasRenderingContext2D,
  chartArea: ChartArea | undefined,
  color: string,
  alphaTop = 0.32,
  alphaBottom = 0.02,
): CanvasGradient | string {
  if (!chartArea) return color;
  const g = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
  const hex = color.replace("#", "");
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const gChan = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  g.addColorStop(0, `rgba(${r},${gChan},${b},${alphaTop})`);
  g.addColorStop(1, `rgba(${r},${gChan},${b},${alphaBottom})`);
  return g;
}

type BarScriptable = ScriptableContext<"bar">;

export function barVerticalGradientScriptable(top: string, bottom: string) {
  return (context: BarScriptable): CanvasGradient | string => {
    const { chart } = context;
    return verticalGradient(chart.ctx, chart.chartArea, top, bottom);
  };
}

export function barHorizontalGradientScriptable(left: string, right: string) {
  return (context: BarScriptable): CanvasGradient | string => {
    const { chart } = context;
    return horizontalGradient(chart.ctx, chart.chartArea, left, right);
  };
}

export function premiumBarOptions(overrides?: ChartOptions<"bar">): ChartOptions<"bar"> {
  const base: ChartOptions<"bar"> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    animation: PREMIUM_ANIMATION_STAGGER,
    datasets: {
      bar: {
        barPercentage: 0.78,
        categoryPercentage: 0.72,
      },
    },
    plugins: {
      legend: {
        display: true,
        position: "bottom",
        labels: {
          color: "#475569",
          font: { size: 11, weight: 600 },
          usePointStyle: true,
          pointStyle: "rectRounded",
          padding: 16,
          boxWidth: 10,
          boxHeight: 10,
        },
      },
      tooltip: { ...premiumTooltipDefaults },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { font: { size: 11 }, color: "#64748b", padding: 8, maxRotation: 0 },
        border: { display: false },
      },
      y: {
        beginAtZero: true,
        border: { display: false },
        grid: { color: "rgba(148, 163, 184, 0.16)", lineWidth: 1 },
        ticks: { font: { size: 11 }, color: "#94a3b8", padding: 10 },
      },
    },
  };
  return mergeChartOptions(base, overrides);
}

export function premiumHorizontalBarOptions(overrides?: ChartOptions<"bar">): ChartOptions<"bar"> {
  return premiumBarOptions(
    mergeChartOptions(
      {
        indexAxis: "y",
        animation: PREMIUM_ANIMATION,
        scales: {
          x: {
            beginAtZero: true,
            border: { display: false },
            grid: { color: "rgba(148, 163, 184, 0.16)" },
            ticks: { font: { size: 11 }, color: "#94a3b8", padding: 8 },
          },
          y: {
            grid: { display: false },
            ticks: { font: { size: 11 }, color: "#475569", padding: 6 },
            border: { display: false },
          },
        },
      },
      overrides,
    ),
  );
}

export function premiumLineOptions(overrides?: ChartOptions<"line">): ChartOptions<"line"> {
  const base: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    animation: PREMIUM_ANIMATION,
    plugins: {
      legend: {
        display: true,
        position: "bottom",
        labels: {
          color: "#475569",
          font: { size: 11, weight: 600 },
          usePointStyle: true,
          pointStyle: "circle",
          padding: 16,
        },
      },
      tooltip: { ...premiumTooltipDefaults },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { font: { size: 11 }, color: "#64748b", padding: 8 },
        border: { display: false },
      },
      y: {
        beginAtZero: true,
        border: { display: false },
        grid: { color: "rgba(148, 163, 184, 0.14)" },
        ticks: { font: { size: 11 }, color: "#94a3b8", padding: 8 },
      },
    },
    elements: {
      line: { borderCapStyle: "round", borderJoinStyle: "round", borderWidth: 2.5 },
      point: {
        radius: 0,
        hoverRadius: 6,
        hitRadius: 12,
        hoverBorderWidth: 2,
        backgroundColor: "#fff",
      },
    },
  };
  return mergeChartOptions(base, overrides);
}

export function premiumDoughnutOptions(overrides?: ChartOptions<"doughnut">): ChartOptions<"doughnut"> {
  const base: ChartOptions<"doughnut"> = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: "68%",
    rotation: -90,
    circumference: 360,
    animation: {
      ...PREMIUM_ANIMATION,
      animateRotate: true,
      animateScale: true,
    },
    plugins: {
      legend: {
        position: "bottom",
        labels: {
          color: "#475569",
          font: { size: 11, weight: 600 },
          usePointStyle: true,
          pointStyle: "circle",
          padding: 14,
          boxWidth: 8,
        },
      },
      tooltip: { ...premiumTooltipDefaults },
      lonaciSoftShadow: true,
    },
  };
  return mergeChartOptions(base, overrides);
}

export function premiumRadarOptions(overrides?: ChartOptions<"radar">): ChartOptions<"radar"> {
  const base: ChartOptions<"radar"> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: PREMIUM_ANIMATION,
    plugins: {
      legend: { display: false },
      tooltip: { ...premiumTooltipDefaults },
    },
    scales: {
      r: {
        beginAtZero: true,
        angleLines: { color: "rgba(148, 163, 184, 0.22)" },
        grid: { color: "rgba(148, 163, 184, 0.2)" },
        pointLabels: {
          color: "#475569",
          font: { size: 11, weight: 600 },
        },
        ticks: {
          display: false,
          backdropColor: "transparent",
        },
      },
    },
    elements: {
      line: { borderWidth: 2.5, tension: 0.15 },
      point: { radius: 3, hoverRadius: 6, borderWidth: 2, backgroundColor: "#fff" },
    },
  };
  return mergeChartOptions(base as Record<string, unknown>, overrides as Record<string, unknown>) as ChartOptions<"radar">;
}

export function premiumPolarOptions(overrides?: ChartOptions<"polarArea">): ChartOptions<"polarArea"> {
  const base: ChartOptions<"polarArea"> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      ...PREMIUM_ANIMATION,
      animateRotate: true,
      animateScale: true,
    },
    plugins: {
      legend: {
        position: "bottom",
        labels: {
          color: "#475569",
          font: { size: 11, weight: 600 },
          usePointStyle: true,
          pointStyle: "circle",
          padding: 12,
          boxWidth: 8,
        },
      },
      tooltip: { ...premiumTooltipDefaults },
      lonaciSoftShadow: true,
    },
    scales: {
      r: {
        beginAtZero: true,
        ticks: { display: false, backdropColor: "transparent" },
        grid: { color: "rgba(148, 163, 184, 0.18)" },
        angleLines: { color: "rgba(148, 163, 184, 0.12)" },
      },
    },
  };
  return mergeChartOptions(base as Record<string, unknown>, overrides as Record<string, unknown>) as ChartOptions<"polarArea">;
}

/** Active crosshair + soft shadow sur les options line/bar. */
export function withExecutiveOverlays<T extends object>(opts: T): T {
  return mergeChartOptions(opts as Record<string, unknown>, {
    plugins: {
      lonaciCrosshair: { color: "rgba(249, 115, 22, 0.4)", dash: [5, 5] },
      lonaciSoftShadow: true,
    },
  } as Record<string, unknown>) as T;
}

function mergeChartOptions<T extends Record<string, unknown>>(base: T, overrides?: T): T {
  if (!overrides) return base;
  const out = { ...base, ...overrides } as T;
  const basePlugins = (base as { plugins?: Record<string, unknown> }).plugins;
  const overridePlugins = (overrides as { plugins?: Record<string, unknown> }).plugins;
  if (basePlugins || overridePlugins) {
    (out as { plugins?: Record<string, unknown> }).plugins = {
      ...basePlugins,
      ...overridePlugins,
      legend: {
        ...(basePlugins?.legend as object | undefined),
        ...(overridePlugins?.legend as object | undefined),
      },
      tooltip: {
        ...(basePlugins?.tooltip as object | undefined),
        ...(overridePlugins?.tooltip as object | undefined),
        callbacks: {
          ...((basePlugins?.tooltip as { callbacks?: object } | undefined)?.callbacks ?? {}),
          ...((overridePlugins?.tooltip as { callbacks?: object } | undefined)?.callbacks ?? {}),
        },
      },
    };
  }
  const baseScales = (base as { scales?: Record<string, unknown> }).scales;
  const overrideScales = (overrides as { scales?: Record<string, unknown> }).scales;
  if (baseScales || overrideScales) {
    (out as { scales?: Record<string, unknown> }).scales = {
      ...baseScales,
      ...overrideScales,
    };
  }
  return out;
}

export function paletteSlice(n: number): string[] {
  if (n <= 0) return [];
  const out: string[] = [];
  for (let i = 0; i < n; i += 1) {
    out.push(PREMIUM_PALETTE[i % PREMIUM_PALETTE.length]!);
  }
  return out;
}
