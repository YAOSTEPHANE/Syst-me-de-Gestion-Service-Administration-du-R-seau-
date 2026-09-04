import type { Chart, ChartType, Plugin, TooltipModel } from "chart.js";

export type DoughnutCenterPluginOptions = {
  value?: string;
  label?: string;
  valueColor?: string;
  labelColor?: string;
};

export type CrosshairPluginOptions = {
  color?: string;
  width?: number;
  dash?: number[];
};

declare module "chart.js" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface PluginOptionsByType<TType extends ChartType> {
    lonaciDoughnutCenter?: DoughnutCenterPluginOptions;
    lonaciCrosshair?: CrosshairPluginOptions | false;
    lonaciSoftShadow?: boolean;
  }
}

/** Libellé central animé pour les donuts (total + caption). */
export const lonaciDoughnutCenterPlugin: Plugin<"doughnut"> = {
  id: "lonaciDoughnutCenter",
  afterDraw(chart) {
    const opts = chart.options.plugins?.lonaciDoughnutCenter;
    if (!opts?.value) return;
    const { ctx, chartArea } = chart;
    if (!chartArea) return;
    const cx = (chartArea.left + chartArea.right) / 2;
    const cy = (chartArea.top + chartArea.bottom) / 2;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = opts.valueColor ?? "#0f172a";
    ctx.font = "800 22px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(opts.value, cx, cy - 8);
    if (opts.label) {
      ctx.fillStyle = opts.labelColor ?? "#64748b";
      ctx.font = "600 11px ui-sans-serif, system-ui, sans-serif";
      ctx.fillText(opts.label, cx, cy + 14);
    }
    ctx.restore();
  },
};

/** Ligne de croisement exécutive au survol (line / bar). */
export const lonaciCrosshairPlugin: Plugin = {
  id: "lonaciCrosshair",
  afterDraw(chart) {
    const cfg = chart.options.plugins?.lonaciCrosshair;
    if (cfg === false || cfg == null) return;
    const tooltip = chart.tooltip as TooltipModel<ChartType> | undefined;
    const active = tooltip?.getActiveElements?.() ?? [];
    if (!active.length) return;
    const first = active[0];
    if (!first) return;
    const x = first.element.x;
    const { top, bottom } = chart.chartArea;
    const ctx = chart.ctx;
    const dash: number[] = (cfg.dash ?? [4, 4]).filter((n): n is number => typeof n === "number");
    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = cfg.color ?? "rgba(249, 115, 22, 0.45)";
    ctx.lineWidth = cfg.width ?? 1.25;
    (ctx as CanvasRenderingContext2D).setLineDash(dash.length ? dash : [4, 4]);
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();
    ctx.restore();
  },
};

/** Ombre douce sous les datasets (effet profondeur). */
export const lonaciSoftShadowPlugin: Plugin = {
  id: "lonaciSoftShadow",
  beforeDatasetsDraw(chart) {
    if (!chart.options.plugins?.lonaciSoftShadow) return;
    const ctx = chart.ctx;
    ctx.save();
    ctx.shadowColor = "rgba(15, 23, 42, 0.18)";
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 6;
  },
  afterDatasetsDraw(chart) {
    if (!chart.options.plugins?.lonaciSoftShadow) return;
    chart.ctx.restore();
  },
};

/** Halo lumineux sur le point actif d’une courbe. */
export const lonaciPointGlowPlugin: Plugin<"line"> = {
  id: "lonaciPointGlow",
  afterDatasetsDraw(chart) {
    const tooltip = chart.tooltip;
    const active = tooltip?.getActiveElements?.() ?? [];
    if (!active.length) return;
    const ctx = chart.ctx;
    for (const item of active) {
      if (item.datasetIndex == null) continue;
      const meta = chart.getDatasetMeta(item.datasetIndex);
      const el = meta.data[item.index];
      if (!el || !("x" in el) || !("y" in el)) continue;
      const x = el.x;
      const y = el.y;
      const color = resolveStrokeColor(chart.data.datasets[item.datasetIndex]?.borderColor, item.index);
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, Math.PI * 2);
      ctx.fillStyle = withAlpha(color, 0.18);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  },
};

function resolveStrokeColor(raw: unknown, index: number): string {
  if (typeof raw === "string" && raw.length > 0) return raw;
  if (Array.isArray(raw)) {
    const at = raw[index] ?? raw[0];
    if (typeof at === "string" && at.length > 0) return at;
  }
  return "#f97316";
}

function withAlpha(color: unknown, alpha: number): string {
  if (typeof color !== "string") return `rgba(249,115,22,${alpha})`;
  if (color.startsWith("#") && color.length === 7) {
    const r = Number.parseInt(color.slice(1, 3), 16);
    const g = Number.parseInt(color.slice(3, 5), 16);
    const b = Number.parseInt(color.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  if (color.startsWith("rgba(")) {
    return color.replace(/rgba\(([^)]+),\s*[\d.]+\s*\)/, `rgba($1, ${alpha})`);
  }
  if (color.startsWith("rgb(")) {
    return color.replace("rgb(", "rgba(").replace(")", `, ${alpha})`);
  }
  return `rgba(249,115,22,${alpha})`;
}

export function registerPremiumChartPlugins(chartJs: typeof Chart): void {
  chartJs.register(
    lonaciDoughnutCenterPlugin,
    lonaciCrosshairPlugin,
    lonaciSoftShadowPlugin,
    lonaciPointGlowPlugin,
  );
}
