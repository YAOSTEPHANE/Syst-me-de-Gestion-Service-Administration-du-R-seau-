"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ArcElement, BarElement, Tooltip, Legend);

type Period = "daily" | "weekly" | "monthly";
type AgenceRef = { id: string; code: string; libelle: string; actif: boolean };
const cronScheduleLabel = process.env.NEXT_PUBLIC_CRON_SCHEDULE_LABEL?.trim() || "08h00 locale";
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
};

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
  const [toast, setToast] = useState<string | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [compareAgences, setCompareAgences] = useState(true);
  const [topAgences, setTopAgences] = useState(8);

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
        legend: { labels: { color: "#475569", font: { size: 11 } } },
      },
      scales: {
        x: { ticks: { color: "#64748b", font: { size: 10 } }, grid: { color: "rgba(148,163,184,0.2)" } },
        y: { ticks: { color: "#64748b", font: { size: 10 } }, grid: { color: "rgba(148,163,184,0.2)" }, beginAtZero: true },
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
          backgroundColor: ["#f59e0b", "#ef4444", "#22c55e", "#6366f1", "#0ea5e9", "#8b5cf6"],
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
      labels: ["Cautions J+10", "Succession stale 30j", "PDV non finalisés", "Contrats résiliés"],
      datasets: [
        {
          label: "Indicateurs de risque",
          data: [cautionAlert, successionStale, pdvPending, contratsResilie],
          backgroundColor: ["#f97316", "#ef4444", "#8b5cf6", "#0ea5e9"],
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
          backgroundColor: "rgba(99,102,241,0.75)",
          borderColor: "#4338ca",
          borderWidth: 1,
          borderRadius: 6,
        },
      ],
    };
  }, [summary]);

  const barOpts = useMemo<ChartOptions<"bar">>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: "#475569", font: { size: 11 } } },
      },
      scales: {
        x: { ticks: { color: "#64748b", font: { size: 10 } }, grid: { display: false } },
        y: { ticks: { color: "#64748b", font: { size: 10 } }, grid: { color: "rgba(148,163,184,0.2)" }, beginAtZero: true },
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
        legend: { position: "bottom", labels: { color: "#475569", font: { size: 11 } } },
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

  function flash(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2800);
  }

  function exportCsv() {
    const params = new URLSearchParams({ period, format: "csv" });
    if (agenceId.trim()) params.set("agenceId", agenceId.trim());
    if (!agenceId.trim() && compareAgences) {
      params.set("compareAgences", "1");
      params.set("topAgences", String(topAgences));
    }
    window.open(`/api/reports/export?${params.toString()}`, "_blank");
    flash("Export CSV lancé");
  }

  function exportXlsx() {
    const params = new URLSearchParams({ period, format: "xlsx" });
    if (agenceId.trim()) params.set("agenceId", agenceId.trim());
    if (!agenceId.trim() && compareAgences) {
      params.set("compareAgences", "1");
      params.set("topAgences", String(topAgences));
    }
    window.open(`/api/reports/export?${params.toString()}`, "_blank");
    flash("Export Excel lancé");
  }

  function printView() {
    const params = new URLSearchParams({ period });
    if (agenceId.trim()) params.set("agenceId", agenceId.trim());
    window.open(`/rapports/print?${params.toString()}`, "_blank", "noopener,noreferrer");
    flash("Aperçu imprimable ouvert");
  }

  async function exportPdf() {
    if (!reportRef.current) {
      flash("Section de rapport introuvable");
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
      const margin = 8;
      const headerHeight = 16;
      const footerHeight = 10;
      const printableWidth = pageWidth - margin * 2;
      const printableHeight = pageHeight - margin * 2 - headerHeight - footerHeight;
      const imageHeight = (canvas.height * printableWidth) / canvas.width;
      const imageData = canvas.toDataURL("image/png");
      const generatedAt = new Date().toLocaleString("fr-FR");
      const periodLabel = periodLabels[period];
      const filterLabel = `Agence: ${selectedAgenceLabel}`;
      const totalPages = Math.max(1, Math.ceil(imageHeight / printableHeight));

      const drawPageHeaderFooter = (pageNumber: number) => {
        pdf.setDrawColor(226, 232, 240);
        pdf.setLineWidth(0.2);
        pdf.line(margin, margin + headerHeight - 2, pageWidth - margin, margin + headerHeight - 2);
        pdf.line(margin, pageHeight - margin - footerHeight + 2, pageWidth - margin, pageHeight - margin - footerHeight + 2);

        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(11);
        pdf.setTextColor(15, 23, 42);
        pdf.text("Infinitecore Systeme - Rapport opérationnel", margin, margin + 5);

        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(9);
        pdf.setTextColor(71, 85, 105);
        pdf.text(`${periodLabel} | ${filterLabel}`, margin, margin + 10);
        pdf.text(`Généré le: ${generatedAt}`, pageWidth - margin, margin + 10, { align: "right" });

        pdf.setFontSize(8);
        pdf.setTextColor(100, 116, 139);
        pdf.text(`Page ${pageNumber}/${totalPages}`, pageWidth - margin, pageHeight - margin - 2, { align: "right" });
      };

      let remainingHeight = imageHeight;
      let yOffset = margin + headerHeight;
      drawPageHeaderFooter(1);
      pdf.addImage(imageData, "PNG", margin, yOffset, printableWidth, imageHeight, undefined, "FAST");
      remainingHeight -= printableHeight;
      let pageNumber = 1;

      while (remainingHeight > 0) {
        pageNumber += 1;
        yOffset = margin + headerHeight - (imageHeight - remainingHeight);
        pdf.addPage();
        drawPageHeaderFooter(pageNumber);
        pdf.addImage(imageData, "PNG", margin, yOffset, printableWidth, imageHeight, undefined, "FAST");
        remainingHeight -= printableHeight;
      }

      const suffix = new Date().toISOString().slice(0, 10);
      pdf.save(`lonaci-rapport-${period}-${suffix}.pdf`);
      flash("Export PDF terminé");
    } catch {
      flash("Échec de l'export PDF");
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
      className="relative overflow-hidden rounded-3xl border border-slate-200 bg-linear-to-br from-amber-50/60 via-white to-sky-50/50 p-6 shadow-sm"
    >
      <div className="pointer-events-none absolute -left-16 -top-16 h-52 w-52 rounded-full bg-amber-300/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 -right-20 h-72 w-72 rounded-full bg-indigo-400/15 blur-3xl" />
      {toast ? (
        <div className="fixed bottom-5 right-5 z-100 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 shadow-lg">
          {toast}
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-amber-700">Infinitecore Systeme</p>
          <h2 className="text-lg font-semibold text-slate-900">Rapports</h2>
          <p className="mt-0.5 text-xs text-slate-600">Analyse, exports et vue pilotage</p>
          <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-700">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />
            Scope agence: {selectedAgenceLabel}
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            void load();
            flash("Rapport régénéré");
          }}
          className="rounded border border-amber-600 bg-amber-600 px-3 py-1.5 text-sm font-medium text-white transition hover:border-amber-700 hover:bg-amber-700"
        >
          Générer rapport
        </button>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <button
          type="button"
          onClick={() => {
            setPeriod("monthly");
            void load();
            flash("Période : mensuelle (30 j.)");
          }}
          className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-left transition hover:border-amber-300"
        >
          <div className="text-sm font-medium text-slate-900">Rapport mensuel</div>
          <div className="mt-1 text-xs text-slate-600">Synthèse glissante 30 jours</div>
          <div className="mt-2">
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
              Disponible
            </span>
          </div>
        </button>
        <button
          type="button"
          onClick={() => {
            exportCsv();
          }}
          className="rounded-xl border border-sky-200 bg-sky-50/70 p-4 text-left transition hover:border-sky-300"
        >
          <div className="text-sm font-medium text-slate-900">Performance agences</div>
          <div className="mt-1 text-xs text-slate-600">Export CSV des agrégats</div>
          <div className="mt-2">
            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-700">Excel</span>
          </div>
        </button>
        <Link
          href="/alertes"
          className="rounded-xl border border-rose-200 bg-rose-50/70 p-4 text-left transition hover:border-rose-300"
        >
          <div className="text-sm font-medium text-slate-900">Alertes &amp; retards</div>
          <div className="mt-1 text-xs text-slate-600">Dossiers problématiques</div>
          <div className="mt-2">
            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700">
              {urgentHint} indicateurs critiques
            </span>
          </div>
        </Link>
      </div>

      <div className="mb-5 grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur">
          <div className="mb-3 text-sm font-semibold text-slate-800">Tendance activité (7 j.)</div>
          <div className="h-[220px]">
            {kpi ? <Line data={lineData} options={lineOpts} /> : <p className="text-xs text-slate-500">Chargement du graphique…</p>}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur">
          <div className="mb-3 text-sm font-semibold text-slate-800">Répartition modules</div>
          <div className="h-[220px]">
            <Doughnut data={moduleDoughnutData} options={doughnutOpts} />
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur">
          <div className="mb-3 text-sm font-semibold text-slate-800">Heatmap risques</div>
          <div className="h-[220px]">
            <Bar data={riskBarData} options={barOpts} />
          </div>
        </div>
      </div>

      <div className="mb-5 grid gap-4 lg:grid-cols-3">
        <article className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4">
          <p className="text-xs uppercase tracking-[0.12em] text-indigo-700">Tendance semaine</p>
          <p className="mt-2 text-sm text-slate-700">
            Dossiers créés: <span className="font-semibold text-indigo-900">{weekDossiers}</span>
          </p>
          <p className="text-sm text-slate-700">
            Contrats créés: <span className="font-semibold text-indigo-900">{weekContrats}</span>
          </p>
          <p className="text-sm text-slate-700">
            Cautions en attente: <span className="font-semibold text-indigo-900">{weekCautions}</span>
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

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-700">Résumé opérationnel</h3>
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
          <button
            type="button"
            onClick={() => void load()}
            className="rounded border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 hover:bg-slate-50"
          >
            Rafraîchir
          </button>
          <button
            type="button"
            onClick={exportCsv}
            className="rounded border border-emerald-300 bg-emerald-50 px-3 py-1 text-sm text-emerald-700 hover:bg-emerald-100"
          >
            Export CSV (Excel)
          </button>
          <button
            type="button"
            onClick={exportXlsx}
            className="rounded border border-emerald-400 bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-800 hover:bg-emerald-200"
          >
            Export XLSX (multi-feuilles)
          </button>
          <button
            type="button"
            onClick={printView}
            className="rounded border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 hover:bg-slate-50"
          >
            Aperçu imprimable (PDF via navigateur)
          </button>
          <button
            type="button"
            onClick={() => void exportPdf()}
            disabled={exportingPdf}
            className="rounded border border-indigo-300 bg-indigo-50 px-3 py-1 text-sm text-indigo-700 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {exportingPdf ? "Génération PDF..." : "Télécharger PDF (avec graphiques)"}
          </button>
        </div>
      </div>
      <p className="mb-3 text-xs text-slate-600">
        Planification cron (horaire configurable, recommande: {cronScheduleLabel}) : appeler{" "}
        <code className="text-slate-700">POST /api/cron/daily-jobs</code> avec{" "}
        <code className="text-slate-700">Authorization: Bearer {"<CRON_SECRET>"}</code>. Exemple:{" "}
        Vercel Cron (POST), Render Cron Job HTTP, ou GitHub Actions via <code className="text-slate-700">curl</code>.
      </p>
      {loading ? <p className="text-sm text-slate-500">Chargement...</p> : null}
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      {!loading && !error && summary ? (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <article className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">Période analysée</p>
              <p className="mt-1 text-base font-semibold text-slate-900">{summary.windowLabel ?? "—"}</p>
            </article>
            <article className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3">
              <p className="text-[11px] uppercase tracking-wide text-indigo-700">Dossiers (total)</p>
              <p className="mt-1 text-base font-semibold text-indigo-900">{summary.dossiers?.total ?? 0}</p>
            </article>
            <article className="rounded-xl border border-cyan-200 bg-cyan-50/60 p-3">
              <p className="text-[11px] uppercase tracking-wide text-cyan-700">Contrats en cours</p>
              <p className="mt-1 text-base font-semibold text-cyan-900">{summary.contrats?.actifs ?? 0}</p>
            </article>
            <article className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
              <p className="text-[11px] uppercase tracking-wide text-emerald-700">Concessionnaires actifs</p>
              <p className="mt-1 text-base font-semibold text-emerald-900">{summary.concessionnaires?.total ?? 0}</p>
            </article>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur">
            <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-700">Graphique statuts dossiers</h4>
            <div className="mt-3 h-[220px]">
              <Bar data={dossiersStatusData} options={barOpts} />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur">
            <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-700">
              Détail complet de tous les modules
            </h4>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <article className="rounded-xl border border-cyan-200 bg-linear-to-br from-cyan-50 to-white p-3">
                <p className="text-[11px] uppercase tracking-wide text-cyan-700">Contrats</p>
                <p className="mt-2 text-sm text-slate-700">Actifs: <span className="font-semibold">{summary.modules?.contrats?.actifs ?? summary.contrats?.actifs ?? 0}</span></p>
                <p className="text-sm text-slate-700">Résiliés: <span className="font-semibold">{summary.modules?.contrats?.resilie ?? summary.contrats?.resilie ?? 0}</span></p>
                <p className="text-sm text-slate-700">Créés période: <span className="font-semibold">{summary.modules?.contrats?.createdInWindow ?? summary.contrats?.createdInWindow ?? 0}</span></p>
              </article>
              <article className="rounded-xl border border-rose-200 bg-linear-to-br from-rose-50 to-white p-3">
                <p className="text-[11px] uppercase tracking-wide text-rose-700">Cautions</p>
                <p className="mt-2 text-sm text-slate-700">En attente: <span className="font-semibold">{summary.modules?.cautions?.enAttente ?? summary.cautions?.enAttente ?? 0}</span></p>
                <p className="text-sm text-slate-700">Alertes J+10: <span className="font-semibold">{summary.modules?.cautions?.alertesJ10 ?? summary.cautions?.alertesJ10 ?? 0}</span></p>
              </article>
              <article className="rounded-xl border border-emerald-200 bg-linear-to-br from-emerald-50 to-white p-3">
                <p className="text-[11px] uppercase tracking-wide text-emerald-700">Concessionnaires</p>
                <p className="mt-2 text-sm text-slate-700">Total actifs: <span className="font-semibold">{summary.modules?.concessionnaires?.total ?? summary.concessionnaires?.total ?? 0}</span></p>
              </article>
              <article className="rounded-xl border border-indigo-200 bg-linear-to-br from-indigo-50 to-white p-3">
                <p className="text-[11px] uppercase tracking-wide text-indigo-700">Dossiers</p>
                <p className="mt-2 text-sm text-slate-700">Total: <span className="font-semibold">{summary.modules?.dossiers?.total ?? summary.dossiers?.total ?? 0}</span></p>
                <p className="text-sm text-slate-700">Créés période: <span className="font-semibold">{summary.modules?.dossiers?.createdInWindow ?? summary.dossiers?.createdInWindow ?? 0}</span></p>
              </article>
              <article className="rounded-xl border border-amber-200 bg-linear-to-br from-amber-50 to-white p-3">
                <p className="text-[11px] uppercase tracking-wide text-amber-700">Succession</p>
                <p className="mt-2 text-sm text-slate-700">Ouverts: <span className="font-semibold">{summary.modules?.succession?.ouverts ?? summary.succession?.ouverts ?? 0}</span></p>
                <p className="text-sm text-slate-700">Stale 30j: <span className="font-semibold">{summary.modules?.succession?.stale30j ?? summary.succession?.stale30j ?? 0}</span></p>
              </article>
              <article className="rounded-xl border border-violet-200 bg-linear-to-br from-violet-50 to-white p-3">
                <p className="text-[11px] uppercase tracking-wide text-violet-700">Géolocalisation PDV</p>
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
