"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  Building2,
  Download,
  FileDown,
  FileSpreadsheet,
  Printer,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import type { ChartOptions } from "chart.js";
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from "chart.js";
import { Bar, Doughnut, Line } from "react-chartjs-2";
import Link from "next/link";

import type { LonaciKpiPayload } from "@/lib/lonaci/lonaci-kpi-types";
import { calculateRasterPageSlices, CLIENT_PDF_COLORS } from "@/lib/pdf/client-premium";
import { notify } from "@/lib/toast";
import { Badge } from "@/components/lonaci/ui/badge";
import { Button } from "@/components/lonaci/ui/button";
import { ChartCard, KpiCard } from "@/components/lonaci/ui/dashboard-cards";
import { FeedbackState, Skeleton } from "@/components/lonaci/ui/feedback-state";
import { PageHeader, SectionHeader } from "@/components/lonaci/ui/headers";
import { Surface } from "@/components/lonaci/ui/surface";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ArcElement, BarElement, Tooltip, Legend);

type Period = "daily" | "weekly" | "monthly";
type ProductTrendFilter = "all" | "up" | "down";
type AgenceRef = { id: string; code: string; libelle: string; actif: boolean };
const periodLabels: Record<Period, string> = {
  daily: "Journalier",
  weekly: "Hebdomadaire",
  monthly: "Mensuel",
};
type ReportSummary = {
  agenceComparatif?: Array<{
    agenceId: string;
    agenceCode: string;
    agenceLabel: string;
    dossiersTotal: number;
    dossiersCreatedInWindow: number;
    concessionnairesTotal: number;
    successionOuverts: number;
    pdvNonFinalise: number;
  }>;
  period: Period;
  windowLabel?: string;
  dossiers?: { total?: number; createdInWindow?: number; byStatus?: Record<string, number> };
  contrats?: { actifs?: number; resilie?: number; createdInWindow?: number };
  concessionnaires?: { total?: number };
  cautions?: { enAttente?: number; alertesJ10?: number };
  succession?: { ouverts?: number; stale30j?: number };
  pdvIntegrations?: { nonFinalise?: number };
  modules?: {
    contrats?: { actifs?: number; resilie?: number; createdInWindow?: number };
    cautions?: { enAttente?: number; alertesJ10?: number };
    concessionnaires?: { total?: number };
    dossiers?: { total?: number; createdInWindow?: number };
    succession?: { ouverts?: number; stale30j?: number };
    pdvIntegrations?: { nonFinalise?: number };
  };
  products?: {
    actifsByProduit?: Array<{ produitCode: string; produitLibelle?: string; count: number }>;
    volumeByProduitWindow?: Array<{
      produitCode: string;
      produitLibelle?: string;
      currentWindow: number;
      previousWindow: number;
      trendPct: number;
    }>;
  };
};

function produitLabel(code: string, libelle?: string): string {
  const cleanCode = (code || "—").trim();
  const cleanLibelle = (libelle || "").trim();
  if (!cleanLibelle) return cleanCode;
  return `${cleanCode} - ${cleanLibelle}`;
}

export default function ReportsPanel() {
  const reportRef = useRef<HTMLElement | null>(null);
  const [period, setPeriod] = useState<Period>("daily");
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kpi, setKpi] = useState<LonaciKpiPayload | null>(null);
  const [agences, setAgences] = useState<AgenceRef[]>([]);
  const [agenceId, setAgenceId] = useState("");
  const [weeklySummary, setWeeklySummary] = useState<ReportSummary | null>(null);
  const [monthlySummary, setMonthlySummary] = useState<ReportSummary | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [compareAgences, setCompareAgences] = useState(true);
  const [topAgences, setTopAgences] = useState(8);
  const [productTrendFilter, setProductTrendFilter] = useState<ProductTrendFilter>("all");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ period });
      if (agenceId.trim()) params.set("agenceId", agenceId.trim());
      if (!agenceId.trim() && compareAgences) {
        params.set("compareAgences", "1");
        params.set("topAgences", String(topAgences));
      }
      const res = await fetch(`/api/reports/summary?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Résumé indisponible");
      const data = (await res.json()) as ReportSummary;
      setSummary(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recharger uniquement quand la période change
  }, [period, agenceId, compareAgences, topAgences]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/dashboard/kpi", { credentials: "include", cache: "no-store" });
        if (res.ok) setKpi((await res.json()) as LonaciKpiPayload);
      } catch {
        /* graphique optionnel */
      }
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const weeklyParams = new URLSearchParams({ period: "weekly" });
        const monthlyParams = new URLSearchParams({ period: "monthly" });
        if (agenceId.trim()) {
          weeklyParams.set("agenceId", agenceId.trim());
          monthlyParams.set("agenceId", agenceId.trim());
        }
        const [weeklyRes, monthlyRes] = await Promise.all([
          fetch(`/api/reports/summary?${weeklyParams.toString()}`, { credentials: "include", cache: "no-store" }),
          fetch(`/api/reports/summary?${monthlyParams.toString()}`, { credentials: "include", cache: "no-store" }),
        ]);
        if (weeklyRes.ok) {
          setWeeklySummary((await weeklyRes.json()) as ReportSummary);
        } else {
          setWeeklySummary(null);
        }
        if (monthlyRes.ok) {
          setMonthlySummary((await monthlyRes.json()) as ReportSummary);
        } else {
          setMonthlySummary(null);
        }
      } catch {
        setWeeklySummary(null);
        setMonthlySummary(null);
      }
    })();
  }, [agenceId]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/referentials", { credentials: "include", cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { agences?: AgenceRef[] };
        setAgences((data.agences ?? []).filter((a) => a.actif));
      } catch {
        setAgences([]);
      }
    })();
  }, []);

  const lineData = useMemo(() => {
    const rows = kpi?.activity7d ?? [];
    return {
      labels: rows.map((r) => r.label),
      datasets: [
        {
          label: "Volume agrégé (contrats + cautions + intégr.)",
          data: rows.map((r) => r.contracts + r.cautions + r.integrations),
          borderColor: "#f59e0b",
          backgroundColor: "rgba(245,158,11,0.12)",
          tension: 0.35,
          fill: true,
          pointRadius: 3,
        },
      ],
    };
  }, [kpi]);

  const lineOpts = useMemo<ChartOptions<"line">>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: "#475569", font: { size: 12 } } },
      },
      scales: {
        x: { ticks: { color: "#64748b", font: { size: 12 } }, grid: { color: "rgba(148,163,184,0.2)" } },
        y: { ticks: { color: "#64748b", font: { size: 12 } }, grid: { color: "rgba(148,163,184,0.2)" }, beginAtZero: true },
      },
    }),
    [],
  );

  const moduleDistribution = useMemo(() => {
    const contracts = summary?.modules?.contrats?.actifs ?? summary?.contrats?.actifs ?? 0;
    const cautions = summary?.modules?.cautions?.enAttente ?? summary?.cautions?.enAttente ?? 0;
    const concessionnaires = summary?.modules?.concessionnaires?.total ?? summary?.concessionnaires?.total ?? 0;
    const dossiers = summary?.modules?.dossiers?.total ?? summary?.dossiers?.total ?? 0;
    const succession = summary?.modules?.succession?.ouverts ?? summary?.succession?.ouverts ?? 0;
    const pdv = summary?.modules?.pdvIntegrations?.nonFinalise ?? summary?.pdvIntegrations?.nonFinalise ?? 0;
    return {
      labels: ["Contrats", "Cautions", "Concessionnaires", "Dossiers", "Succession", "PDV"],
      values: [contracts, cautions, concessionnaires, dossiers, succession, pdv],
    };
  }, [summary]);

  const moduleDoughnutData = useMemo(
    () => ({
      labels: moduleDistribution.labels,
      datasets: [
        {
          label: "Répartition des volumes",
          data: moduleDistribution.values,
          backgroundColor: ["#f97316", "#ef4444", "#22c55e", "#1e3a5f", "#0f766e", "#64748b"],
          borderColor: "rgba(255,255,255,0.85)",
          borderWidth: 1.5,
        },
      ],
    }),
    [moduleDistribution],
  );

  const riskBarData = useMemo(() => {
    const cautionAlert = summary?.modules?.cautions?.alertesJ10 ?? summary?.cautions?.alertesJ10 ?? 0;
    const successionStale = summary?.modules?.succession?.stale30j ?? summary?.succession?.stale30j ?? 0;
    const pdvPending = summary?.modules?.pdvIntegrations?.nonFinalise ?? summary?.pdvIntegrations?.nonFinalise ?? 0;
    const contratsResilie = summary?.modules?.contrats?.resilie ?? summary?.contrats?.resilie ?? 0;
    return {
      labels: ["Cautions J+10", "Successions sans activité 30j", "PDV non finalisés", "Contrats résiliés"],
      datasets: [
        {
          label: "Indicateurs de risque",
          data: [cautionAlert, successionStale, pdvPending, contratsResilie],
          backgroundColor: ["#f97316", "#ef4444", "#eab308", "#1e3a5f"],
          borderRadius: 8,
        },
      ],
    };
  }, [summary]);

  const dossiersStatusData = useMemo(() => {
    const statuses = summary?.dossiers?.byStatus ?? {};
    const labels = Object.keys(statuses);
    const values = labels.map((k) => statuses[k] ?? 0);
    return {
      labels,
      datasets: [
        {
          label: "Dossiers par statut",
          data: values,
          backgroundColor: "rgba(249,115,22,0.78)",
          borderColor: "#c2410c",
          borderWidth: 1,
          borderRadius: 6,
        },
      ],
    };
  }, [summary]);

  const productActiveRows = useMemo(() => summary?.products?.actifsByProduit ?? [], [summary]);
  const productWindowRows = useMemo(() => summary?.products?.volumeByProduitWindow ?? [], [summary]);
  const filteredProductTrendRows = useMemo(() => {
    const sorted = [...productWindowRows].sort((a, b) => b.trendPct - a.trendPct);
    if (productTrendFilter === "up") return sorted.filter((row) => row.trendPct > 0);
    if (productTrendFilter === "down") return sorted.filter((row) => row.trendPct < 0);
    return sorted;
  }, [productWindowRows, productTrendFilter]);
  const productsToWatch = useMemo(
    () =>
      [...filteredProductTrendRows]
        .sort((a, b) => Math.abs(b.trendPct) - Math.abs(a.trendPct))
        .slice(0, 3),
    [filteredProductTrendRows],
  );

  const productsActiveDoughnutData = useMemo(
    () => ({
      labels: productActiveRows.map((row) => produitLabel(row.produitCode, row.produitLibelle)),
      datasets: [
        {
          label: "Contrats actifs",
          data: productActiveRows.map((row) => row.count),
          backgroundColor: [
            "#f97316",
            "#14b8a6",
            "#1e3a5f",
            "#f59e0b",
            "#ef4444",
            "#334155",
            "#22c55e",
            "#64748b",
          ],
          borderColor: "rgba(255,255,255,0.9)",
          borderWidth: 1.5,
        },
      ],
    }),
    [productActiveRows],
  );

  const productsTrendBarData = useMemo(
    () => ({
      labels: productWindowRows.map((row) => row.produitCode),
      datasets: [
        {
          label: "Période courante",
          data: productWindowRows.map((row) => row.currentWindow),
          backgroundColor: "rgba(249,115,22,0.82)",
          borderColor: "#c2410c",
          borderWidth: 1,
          borderRadius: 8,
        },
        {
          label: "Période précédente",
          data: productWindowRows.map((row) => row.previousWindow),
          backgroundColor: "rgba(148,163,184,0.72)",
          borderColor: "#64748b",
          borderWidth: 1,
          borderRadius: 8,
        },
      ],
    }),
    [productWindowRows],
  );

  const productsTrendPctBarData = useMemo(
    () => ({
      labels: filteredProductTrendRows.map((row) => row.produitCode),
      datasets: [
        {
          label: "Variation (%)",
          data: filteredProductTrendRows.map((row) => row.trendPct),
          backgroundColor: filteredProductTrendRows.map((row) =>
            row.trendPct >= 0 ? "rgba(34,197,94,0.75)" : "rgba(239,68,68,0.75)",
          ),
          borderColor: filteredProductTrendRows.map((row) => (row.trendPct >= 0 ? "#15803d" : "#b91c1c")),
          borderWidth: 1,
          borderRadius: 8,
        },
      ],
    }),
    [filteredProductTrendRows],
  );

  const trendPctOpts = useMemo<ChartOptions<"bar">>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: "y",
      plugins: {
        legend: { labels: { color: "#475569", font: { size: 12 } } },
      },
      scales: {
        x: {
          ticks: { color: "#64748b", font: { size: 12 } },
          grid: { color: "rgba(148,163,184,0.2)" },
          beginAtZero: true,
        },
        y: {
          ticks: { color: "#64748b", font: { size: 12 } },
          grid: { display: false },
        },
      },
    }),
    [],
  );

  const barOpts = useMemo<ChartOptions<"bar">>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: "#475569", font: { size: 12 } } },
      },
      scales: {
        x: { ticks: { color: "#64748b", font: { size: 12 } }, grid: { display: false } },
        y: { ticks: { color: "#64748b", font: { size: 12 } }, grid: { color: "rgba(148,163,184,0.2)" }, beginAtZero: true },
      },
    }),
    [],
  );

  const doughnutOpts = useMemo<ChartOptions<"doughnut">>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      cutout: "65%",
      plugins: {
        legend: { position: "bottom", labels: { color: "#475569", font: { size: 12 } } },
      },
    }),
    [],
  );

  const trendWeekMonthData = useMemo(() => {
    const wDossiers = weeklySummary?.dossiers?.createdInWindow ?? 0;
    const mDossiers = monthlySummary?.dossiers?.createdInWindow ?? 0;
    const wContrats = weeklySummary?.contrats?.createdInWindow ?? 0;
    const mContrats = monthlySummary?.contrats?.createdInWindow ?? 0;
    const wCautions = weeklySummary?.cautions?.enAttente ?? 0;
    const mCautions = monthlySummary?.cautions?.enAttente ?? 0;
    return {
      labels: ["Semaine (7j)", "Mois (30j)"],
      datasets: [
        {
          label: "Dossiers créés",
          data: [wDossiers, mDossiers],
          borderColor: "#6366f1",
          backgroundColor: "rgba(99,102,241,0.18)",
          tension: 0.3,
          fill: true,
          pointRadius: 3,
        },
        {
          label: "Contrats créés",
          data: [wContrats, mContrats],
          borderColor: "#f59e0b",
          backgroundColor: "rgba(245,158,11,0.14)",
          tension: 0.3,
          fill: true,
          pointRadius: 3,
        },
        {
          label: "Cautions en attente",
          data: [wCautions, mCautions],
          borderColor: "#ef4444",
          backgroundColor: "rgba(239,68,68,0.12)",
          tension: 0.3,
          fill: true,
          pointRadius: 3,
        },
      ],
    };
  }, [weeklySummary, monthlySummary]);

  function pctDelta(weekValue: number, monthValue: number): { label: string; tone: string } {
    if (weekValue === 0 && monthValue === 0) {
      return { label: "0%", tone: "text-slate-600" };
    }
    if (weekValue === 0) {
      return { label: "+100%", tone: "text-emerald-700" };
    }
    const delta = ((monthValue - weekValue) / weekValue) * 100;
    const rounded = Math.round(delta * 10) / 10;
    if (rounded > 0) return { label: `+${rounded}%`, tone: "text-emerald-700" };
    if (rounded < 0) return { label: `${rounded}%`, tone: "text-rose-700" };
    return { label: "0%", tone: "text-slate-600" };
  }

  const weekDossiers = weeklySummary?.dossiers?.createdInWindow ?? 0;
  const monthDossiers = monthlySummary?.dossiers?.createdInWindow ?? 0;
  const weekContrats = weeklySummary?.contrats?.createdInWindow ?? 0;
  const monthContrats = monthlySummary?.contrats?.createdInWindow ?? 0;
  const weekCautions = weeklySummary?.cautions?.enAttente ?? 0;
  const monthCautions = monthlySummary?.cautions?.enAttente ?? 0;

  const deltaDossiers = pctDelta(weekDossiers, monthDossiers);
  const deltaContrats = pctDelta(weekContrats, monthContrats);
  const deltaCautions = pctDelta(weekCautions, monthCautions);

  function exportCsv() {
    const params = new URLSearchParams({ period, format: "csv" });
    if (agenceId.trim()) params.set("agenceId", agenceId.trim());
    if (!agenceId.trim() && compareAgences) {
      params.set("compareAgences", "1");
      params.set("topAgences", String(topAgences));
    }
    window.open(`/api/reports/export?${params.toString()}`, "_blank");
    notify.success("Export CSV lancé");
  }

  function exportXlsx() {
    const params = new URLSearchParams({ period, format: "xlsx" });
    if (agenceId.trim()) params.set("agenceId", agenceId.trim());
    if (!agenceId.trim() && compareAgences) {
      params.set("compareAgences", "1");
      params.set("topAgences", String(topAgences));
    }
    window.open(`/api/reports/export?${params.toString()}`, "_blank");
    notify.success("Export Excel lancé");
  }

  function printView() {
    const params = new URLSearchParams({ period });
    if (agenceId.trim()) params.set("agenceId", agenceId.trim());
    window.open(`/rapports/print?${params.toString()}`, "_blank", "noopener,noreferrer");
    notify.success("Aperçu imprimable ouvert");
  }

  async function exportPdf() {
    if (!reportRef.current) {
      notify.error("Section de rapport introuvable");
      return;
    }
    setExportingPdf(true);
    try {
      await new Promise((resolve) => window.setTimeout(resolve, 250));
      const [{ toCanvas }, { default: JsPdf }] = await Promise.all([import("html-to-image"), import("jspdf")]);
      const canvas = await toCanvas(reportRef.current, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: "#ffffff",
      });
      const pdf = new JsPdf("p", "mm", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const headerHeight = 21;
      const footerHeight = 12;
      const printableWidth = pageWidth - margin * 2;
      const printableHeight = pageHeight - margin * 2 - headerHeight - footerHeight;
      const generatedAt = new Date().toLocaleString("fr-FR");
      const periodLabel = periodLabels[period];
      const filterLabel = `Agence: ${selectedAgenceLabel}`;
      const sourcePixelsPerMillimeter = canvas.width / printableWidth;
      const maximumSliceHeight = printableHeight * sourcePixelsPerMillimeter;
      const reportBounds = reportRef.current.getBoundingClientRect();
      const safeBreaks = Array.from(reportRef.current.querySelectorAll<HTMLElement>(":scope > div"))
        .map((element) => (element.getBoundingClientRect().bottom - reportBounds.top) * (canvas.height / reportRef.current!.scrollHeight))
        .filter((value) => value > 0 && value < canvas.height);
      const slices = calculateRasterPageSlices(canvas.height, maximumSliceHeight, safeBreaks);
      const totalPages = slices.length;
      const orange = CLIENT_PDF_COLORS.orange;
      const orangeDark = CLIENT_PDF_COLORS.orangeDark;

      const drawPageHeaderFooter = (pageNumber: number) => {
        pdf.setFillColor(orange);
        pdf.rect(0, 0, pageWidth, 3.2, "F");
        pdf.setDrawColor(249, 115, 22);
        pdf.setLineWidth(0.2);
        pdf.line(margin, margin + headerHeight - 2, pageWidth - margin, margin + headerHeight - 2);
        pdf.line(margin, pageHeight - margin - footerHeight + 2, pageWidth - margin, pageHeight - margin - footerHeight + 2);

        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(13);
        pdf.setTextColor(orangeDark);
        pdf.text("LONACI", margin, margin + 5);
        pdf.setFontSize(10);
        pdf.setTextColor(17, 24, 39);
        pdf.text("Rapport opérationnel", margin, margin + 10);

        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8.5);
        pdf.setTextColor(71, 85, 105);
        pdf.text(`${periodLabel} | ${filterLabel}`, pageWidth - margin, margin + 5, { align: "right" });
        pdf.text(`Généré le ${generatedAt}`, pageWidth - margin, margin + 10, { align: "right" });

        pdf.setFontSize(8);
        pdf.setTextColor(100, 116, 139);
        pdf.text("Loterie Nationale de Côte d’Ivoire · Document interne", margin, pageHeight - margin - 2);
        pdf.text(`Page ${pageNumber}/${totalPages}`, pageWidth - margin, pageHeight - margin - 2, { align: "right" });
      };

      slices.forEach((slice, index) => {
        if (index > 0) pdf.addPage();
        drawPageHeaderFooter(index + 1);
        const sliceCanvas = document.createElement("canvas");
        sliceCanvas.width = canvas.width;
        sliceCanvas.height = Math.ceil(slice.end - slice.start);
        const context = sliceCanvas.getContext("2d");
        if (!context) throw new Error("Contexte graphique indisponible");
        context.fillStyle = CLIENT_PDF_COLORS.surface;
        context.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
        context.drawImage(
          canvas,
          0,
          slice.start,
          canvas.width,
          slice.end - slice.start,
          0,
          0,
          canvas.width,
          slice.end - slice.start,
        );
        const renderedHeight = sliceCanvas.height / sourcePixelsPerMillimeter;
        pdf.addImage(
          sliceCanvas.toDataURL("image/png"),
          "PNG",
          margin,
          margin + headerHeight,
          printableWidth,
          renderedHeight,
          undefined,
          "FAST",
        );
      });

      const suffix = new Date().toISOString().slice(0, 10);
      pdf.save(`lonaci-rapport-${period}-${suffix}.pdf`);
      notify.success("Export PDF terminé");
    } catch {
      notify.error("Échec de l'export PDF");
    } finally {
      setExportingPdf(false);
    }
  }

  const selectedAgenceLabel =
    agenceId.trim().length === 0
      ? "Toutes les agences"
      : agences.find((a) => a.id === agenceId)?.libelle ?? "Agence filtrée";

  const urgentHint =
    (kpi?.dossierValidation.cautionsJ10 ?? 0) +
    (kpi?.dossierValidation.successionStale30j ?? 0) +
    (kpi?.dossierValidation.contratSoumisRetard48h ?? 0);

  return (
    <section
      ref={reportRef}
      className="space-y-5 rounded-3xl bg-slate-50/70 p-4 md:p-6"
    >
      <PageHeader
        eyebrow="Analyse institutionnelle"
        title="Rapports opérationnels"
        description={`Analyse, exports et pilotage · ${selectedAgenceLabel}`}
        actions={
          <Button
            leadingIcon={RefreshCw}
            loading={loading}
            onClick={() => {
              void load();
              notify.success("Rapport régénéré");
            }}
          >
            Générer le rapport
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Surface
          role="button"
          tabIndex={0}
          onClick={() => {
            setPeriod("monthly");
            void load();
            notify.success("Période : mensuelle (30 j.)");
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setPeriod("monthly");
            }
          }}
          className="cursor-pointer border-orange-200 bg-orange-50/60"
        >
          <p className="text-sm font-semibold text-slate-950">Rapport mensuel</p>
          <p className="mt-1 text-xs text-slate-600">Synthèse glissante 30 jours</p>
          <Badge tone="success" className="mt-3">Disponible</Badge>
        </Surface>
        <Surface
          role="button"
          tabIndex={0}
          onClick={exportCsv}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") exportCsv();
          }}
          className="cursor-pointer border-slate-200 bg-white"
        >
          <p className="text-sm font-semibold text-slate-950">Performance agences</p>
          <p className="mt-1 text-xs text-slate-600">Export CSV des agrégats</p>
          <Badge tone="brand" className="mt-3">Excel</Badge>
        </Surface>
        <Link
          href="/alertes"
          className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4 text-left transition hover:border-rose-300"
        >
          <p className="text-sm font-semibold text-slate-950">Alertes &amp; retards</p>
          <p className="mt-1 text-xs text-slate-600">Dossiers problématiques</p>
          <Badge tone="danger" className="mt-3">{urgentHint} indicateurs critiques</Badge>
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard title="Tendance activité" description="7 derniers jours">
          <div className="h-[220px]">
            {kpi ? <Line data={lineData} options={lineOpts} /> : <Skeleton lines={4} />}
          </div>
        </ChartCard>
        <ChartCard title="Répartition modules" description="Volumes par domaine métier">
          <div className="h-[220px]">
            <Doughnut data={moduleDoughnutData} options={doughnutOpts} />
          </div>
        </ChartCard>
        <ChartCard title="Indicateurs de risque" description="Retards et dossiers sensibles">
          <div className="h-[220px]">
            <Bar data={riskBarData} options={barOpts} />
          </div>
        </ChartCard>
      </div>

      <div className="mb-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur">
          <div className="mb-3 text-sm font-semibold text-slate-800">Produits - répartition contrats actifs</div>
          <div className="h-[240px]">
            {productActiveRows.length > 0 ? (
              <Doughnut data={productsActiveDoughnutData} options={doughnutOpts} />
            ) : (
              <p className="text-xs text-slate-500">Aucune donnée produit active sur ce périmètre.</p>
            )}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur">
          <div className="mb-3 text-sm font-semibold text-slate-800">Produits - tendance période</div>
          <div className="h-[240px]">
            {productWindowRows.length > 0 ? (
              <Bar data={productsTrendBarData} options={barOpts} />
            ) : (
              <p className="text-xs text-slate-500">Aucune donnée de tendance produit disponible.</p>
            )}
          </div>
        </div>
      </div>

      <div className="mb-5 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold text-slate-800">Produits - progression (%)</div>
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1 text-xs">
            <button
              type="button"
              onClick={() => setProductTrendFilter("all")}
              className={`rounded px-2 py-1 ${productTrendFilter === "all" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"}`}
            >
              Tous
            </button>
            <button
              type="button"
              onClick={() => setProductTrendFilter("up")}
              className={`rounded px-2 py-1 ${productTrendFilter === "up" ? "bg-emerald-100 text-emerald-800 shadow-sm" : "text-slate-600"}`}
            >
              Top hausses
            </button>
            <button
              type="button"
              onClick={() => setProductTrendFilter("down")}
              className={`rounded px-2 py-1 ${productTrendFilter === "down" ? "bg-rose-100 text-rose-800 shadow-sm" : "text-slate-600"}`}
            >
              Top baisses
            </button>
          </div>
        </div>
        <div className="h-[260px]">
          {filteredProductTrendRows.length > 0 ? (
            <Bar data={productsTrendPctBarData} options={trendPctOpts} />
          ) : (
            <p className="text-xs text-slate-500">Aucune variation produit pour ce filtre.</p>
          )}
        </div>
        <div className="mt-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Top 3 produits à surveiller</div>
          {productsToWatch.length > 0 ? (
            <div className="grid gap-2 md:grid-cols-3">
              {productsToWatch.map((row) => (
                <article key={`watch-${row.produitCode}`} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                  <p className="truncate text-xs font-semibold text-slate-900">{produitLabel(row.produitCode, row.produitLibelle)}</p>
                  <p className="mt-1 text-xs text-slate-600">
                    Courant: <span className="font-semibold text-slate-800">{row.currentWindow}</span> · Préc.:{" "}
                    <span className="font-semibold text-slate-800">{row.previousWindow}</span>
                  </p>
                  <p className={`mt-1 text-xs font-semibold ${row.trendPct >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                    {row.trendPct >= 0 ? "Hausse" : "Baisse"}: {row.trendPct >= 0 ? "+" : ""}
                    {row.trendPct}%
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500">Aucun produit notable pour ce filtre.</p>
          )}
        </div>
      </div>

      <div className="mb-5 grid gap-4 lg:grid-cols-3">
        <article className="rounded-2xl border border-slate-300 bg-slate-100/80 p-4">
          <p className="text-xs uppercase tracking-[0.12em] text-slate-700">Tendance semaine</p>
          <p className="mt-2 text-sm text-slate-700">
            Dossiers créés: <span className="font-semibold text-slate-950">{weekDossiers}</span>
          </p>
          <p className="text-sm text-slate-700">
            Contrats créés: <span className="font-semibold text-slate-950">{weekContrats}</span>
          </p>
          <p className="text-sm text-slate-700">
            Cautions en attente: <span className="font-semibold text-slate-950">{weekCautions}</span>
          </p>
        </article>
        <article className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
          <p className="text-xs uppercase tracking-[0.12em] text-amber-700">Tendance mois</p>
          <p className="mt-2 text-sm text-slate-700">
            Dossiers créés: <span className="font-semibold text-amber-900">{monthDossiers}</span>{" "}
            <span className={`text-xs font-semibold ${deltaDossiers.tone}`}>({deltaDossiers.label} vs semaine)</span>
          </p>
          <p className="text-sm text-slate-700">
            Contrats créés: <span className="font-semibold text-amber-900">{monthContrats}</span>{" "}
            <span className={`text-xs font-semibold ${deltaContrats.tone}`}>({deltaContrats.label} vs semaine)</span>
          </p>
          <p className="text-sm text-slate-700">
            Cautions en attente: <span className="font-semibold text-amber-900">{monthCautions}</span>{" "}
            <span className={`text-xs font-semibold ${deltaCautions.tone}`}>({deltaCautions.label} vs semaine)</span>
          </p>
        </article>
        <div className="rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur">
          <div className="mb-3 text-sm font-semibold text-slate-800">Comparatif semaine / mois</div>
          <div className="h-[180px]">
            <Line data={trendWeekMonthData} options={lineOpts} />
          </div>
        </div>
      </div>

      <Surface>
        <SectionHeader title="Résumé opérationnel" description="Filtres, exports et options de diffusion" />
        <div className="flex flex-wrap gap-2">
          <select
            aria-label="Période"
            value={period}
            onChange={(e) => setPeriod(e.target.value as Period)}
            className="rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900"
          >
            <option value="daily">Journalier (jour UTC en cours)</option>
            <option value="weekly">Hebdomadaire (7 j.)</option>
            <option value="monthly">Mensuel (30 j.)</option>
          </select>
          <select
            aria-label="Agence"
            value={agenceId}
            onChange={(e) => setAgenceId(e.target.value)}
            className="rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900"
          >
            <option value="">Toutes les agences</option>
            {agences.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} — {a.libelle}
              </option>
            ))}
          </select>
          <label className="inline-flex items-center gap-2 rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={compareAgences}
              onChange={(e) => setCompareAgences(e.target.checked)}
              disabled={agenceId.trim().length > 0}
            />
            Comparatif agences
          </label>
          <select
            aria-label="Nombre d'agences à comparer"
            value={topAgences}
            onChange={(e) => setTopAgences(Number(e.target.value))}
            disabled={!compareAgences || agenceId.trim().length > 0}
            className="rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 disabled:opacity-60"
          >
            <option value={5}>Top 5</option>
            <option value={8}>Top 8</option>
            <option value={10}>Top 10</option>
            <option value={15}>Top 15</option>
          </select>
          <Button variant="secondary" size="sm" leadingIcon={RefreshCw} onClick={() => void load()}>
            Rafraîchir
          </Button>
          <Button variant="secondary" size="sm" leadingIcon={FileDown} onClick={exportCsv}>
            Export CSV (Excel)
          </Button>
          <Button variant="secondary" size="sm" leadingIcon={FileSpreadsheet} onClick={exportXlsx}>
            Export XLSX (multi-feuilles)
          </Button>
          <Button variant="secondary" size="sm" leadingIcon={Printer} onClick={printView}>
            Aperçu imprimable (PDF via navigateur)
          </Button>
          <Button
            size="sm"
            leadingIcon={Download}
            onClick={() => void exportPdf()}
            loading={exportingPdf}
          >
            Télécharger PDF (avec graphiques)
          </Button>
        </div>
      </Surface>
      {loading ? <Skeleton lines={4} /> : null}
      {error ? <FeedbackState tone="danger" title="Rapport indisponible" description={error} /> : null}
      {!loading && !error && summary ? (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="Période analysée" value={summary.windowLabel ?? "—"} icon={BarChart3} />
            <KpiCard label="Dossiers" value={summary.dossiers?.total ?? 0} icon={FileSpreadsheet} />
            <KpiCard label="Contrats en cours" value={summary.contrats?.actifs ?? 0} icon={ShieldAlert} />
            <KpiCard label="Concessionnaires actifs" value={summary.concessionnaires?.total ?? 0} icon={Building2} />
          </div>

          <ChartCard title="Statuts des dossiers" description="Répartition sur la période sélectionnée">
            <div className="h-[220px]">
              <Bar data={dossiersStatusData} options={barOpts} />
            </div>
          </ChartCard>

          <div className="rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur">
            <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-700">
              Détail complet de tous les modules
            </h4>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <article className="rounded-xl border border-orange-200 bg-linear-to-br from-orange-50 to-white p-3">
                <p className="text-xs uppercase tracking-wide text-orange-800">Contrats</p>
                <p className="mt-2 text-sm text-slate-700">Actifs: <span className="font-semibold">{summary.modules?.contrats?.actifs ?? summary.contrats?.actifs ?? 0}</span></p>
                <p className="text-sm text-slate-700">Résiliés: <span className="font-semibold">{summary.modules?.contrats?.resilie ?? summary.contrats?.resilie ?? 0}</span></p>
                <p className="text-sm text-slate-700">Créés période: <span className="font-semibold">{summary.modules?.contrats?.createdInWindow ?? summary.contrats?.createdInWindow ?? 0}</span></p>
              </article>
              <article className="rounded-xl border border-rose-200 bg-linear-to-br from-rose-50 to-white p-3">
                <p className="text-xs uppercase tracking-wide text-rose-700">Cautions</p>
                <p className="mt-2 text-sm text-slate-700">En attente: <span className="font-semibold">{summary.modules?.cautions?.enAttente ?? summary.cautions?.enAttente ?? 0}</span></p>
                <p className="text-sm text-slate-700">Alertes J+10: <span className="font-semibold">{summary.modules?.cautions?.alertesJ10 ?? summary.cautions?.alertesJ10 ?? 0}</span></p>
              </article>
              <article className="rounded-xl border border-emerald-200 bg-linear-to-br from-emerald-50 to-white p-3">
                <p className="text-xs uppercase tracking-wide text-emerald-700">Concessionnaires</p>
                <p className="mt-2 text-sm text-slate-700">Total actifs: <span className="font-semibold">{summary.modules?.concessionnaires?.total ?? summary.concessionnaires?.total ?? 0}</span></p>
              </article>
              <article className="rounded-xl border border-slate-300 bg-linear-to-br from-slate-100 to-white p-3">
                <p className="text-xs uppercase tracking-wide text-slate-700">Dossiers</p>
                <p className="mt-2 text-sm text-slate-700">Total: <span className="font-semibold">{summary.modules?.dossiers?.total ?? summary.dossiers?.total ?? 0}</span></p>
                <p className="text-sm text-slate-700">Créés période: <span className="font-semibold">{summary.modules?.dossiers?.createdInWindow ?? summary.dossiers?.createdInWindow ?? 0}</span></p>
              </article>
              <article className="rounded-xl border border-amber-200 bg-linear-to-br from-amber-50 to-white p-3">
                <p className="text-xs uppercase tracking-wide text-amber-700">Succession</p>
                <p className="mt-2 text-sm text-slate-700">Ouverts: <span className="font-semibold">{summary.modules?.succession?.ouverts ?? summary.succession?.ouverts ?? 0}</span></p>
                <p className="text-sm text-slate-700">Stale 30j: <span className="font-semibold">{summary.modules?.succession?.stale30j ?? summary.succession?.stale30j ?? 0}</span></p>
              </article>
              <article className="rounded-xl border border-slate-300 bg-linear-to-br from-slate-100 to-white p-3">
                <p className="text-xs uppercase tracking-wide text-slate-700">Géolocalisation PDV</p>
                <p className="mt-2 text-sm text-slate-700">Non finalisées: <span className="font-semibold">{summary.modules?.pdvIntegrations?.nonFinalise ?? summary.pdvIntegrations?.nonFinalise ?? 0}</span></p>
              </article>
            </div>
          </div>

          {summary.agenceComparatif && summary.agenceComparatif.length > 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur">
              <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-700">
                Comparatif multi-agences
              </h4>
              <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-3 py-2">Agence</th>
                      <th className="px-3 py-2 text-right">Dossiers</th>
                      <th className="px-3 py-2 text-right">Créés période</th>
                      <th className="px-3 py-2 text-right">Concessionnaires</th>
                      <th className="px-3 py-2 text-right">Succession ouverts</th>
                      <th className="px-3 py-2 text-right">PDV non finalisés</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.agenceComparatif.map((row) => (
                      <tr key={row.agenceId} className="border-t border-slate-100 text-slate-700">
                        <td className="px-3 py-2">
                          <span className="font-semibold text-slate-900">{row.agenceCode}</span> - {row.agenceLabel}
                        </td>
                        <td className="px-3 py-2 text-right">{row.dossiersTotal}</td>
                        <td className="px-3 py-2 text-right">{row.dossiersCreatedInWindow}</td>
                        <td className="px-3 py-2 text-right">{row.concessionnairesTotal}</td>
                        <td className="px-3 py-2 text-right">{row.successionOuverts}</td>
                        <td className="px-3 py-2 text-right">{row.pdvNonFinalise}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
