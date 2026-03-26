"use client";

import { useMemo } from "react";
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

import type { ConcessionnairesPanelStats } from "@/lib/lonaci/concessionnaires";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
);

const CHART_FONT = { family: "ui-sans-serif, system-ui, sans-serif" };

const STATUT_COLORS: Record<string, string> = {
  ACTIF: "#059669",
  SUSPENDU: "#64748b",
  INACTIF: "#94a3b8",
  RESILIE: "#e11d48",
  DECEDE: "#be123c",
  SUCCESSION_EN_COURS: "#7c3aed",
};

const BANC_COLORS: Record<string, string> = {
  NON_BANCARISE: "#64748b",
  EN_COURS: "#d97706",
  BANCARISE: "#0d9488",
};

const PRODUIT_COLORS = ["#2563eb", "#0d9488", "#d97706", "#7c3aed", "#db2777", "#0891b2"] as const;

type AgenceRef = { id: string; code: string; libelle: string };

export default function ConcessionnairesCharts({
  stats,
  agences,
  loading,
  error,
}: {
  stats: ConcessionnairesPanelStats | null;
  agences: AgenceRef[];
  loading: boolean;
  error: string | null;
}) {
  const agenceLabel = useMemo(() => {
    const m = new Map(agences.map((a) => [a.id, a.libelle || a.code]));
    return (id: string | null) => (id ? (m.get(id) ?? id.slice(0, 8)) : "Sans agence");
  }, [agences]);

  const doughnutStatut = useMemo(() => {
    const rows = stats?.byStatut ?? [];
    return {
      labels: rows.map((r) => r.label),
      datasets: [
        {
          data: rows.map((r) => r.count),
          backgroundColor: rows.map((r) => STATUT_COLORS[r.key] ?? "#94a3b8"),
          borderWidth: 0,
          hoverOffset: 6,
        },
      ],
    };
  }, [stats?.byStatut]);

  const doughnutBanc = useMemo(() => {
    const rows = stats?.byBancarisation ?? [];
    return {
      labels: rows.map((r) => r.label),
      datasets: [
        {
          data: rows.map((r) => r.count),
          backgroundColor: rows.map((r) => BANC_COLORS[r.key] ?? "#94a3b8"),
          borderWidth: 0,
          hoverOffset: 6,
        },
      ],
    };
  }, [stats?.byBancarisation]);

  const barAgences = useMemo(() => {
    const rows = stats?.byAgence ?? [];
    return {
      labels: rows.map((r) => agenceLabel(r.agenceId)),
      datasets: [
        {
          label: "PDV",
          data: rows.map((r) => r.count),
          backgroundColor: "rgba(6, 182, 212, 0.55)",
          borderColor: "rgba(8, 145, 178, 0.9)",
          borderWidth: 1,
          borderRadius: 4,
          barThickness: 14,
        },
      ],
    };
  }, [stats?.byAgence, agenceLabel]);

  const lineCreations = useMemo(() => {
    const rows = stats?.creésParMois ?? [];
    return {
      labels: rows.map((r) => r.label),
      datasets: [
        {
          label: "Créations enregistrées",
          data: rows.map((r) => r.count),
          borderColor: "#7c3aed",
          backgroundColor: "rgba(124, 58, 237, 0.12)",
          fill: true,
          tension: 0.35,
          pointRadius: 4,
          pointHoverRadius: 6,
        },
      ],
    };
  }, [stats?.creésParMois]);

  const barProduits = useMemo(() => {
    const rows = stats?.byProduit ?? [];
    return {
      labels: rows.map((r) => r.code),
      datasets: [
        {
          label: "PDV avec produit",
          data: rows.map((r) => r.count),
          backgroundColor: rows.map((_, i) => PRODUIT_COLORS[i % PRODUIT_COLORS.length]),
          borderRadius: 4,
          barThickness: 22,
        },
      ],
    };
  }, [stats?.byProduit]);

  const doughnutOpts = useMemo<ChartOptions<"doughnut">>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            boxWidth: 10,
            font: { size: 10, ...CHART_FONT },
            color: "#475569",
            padding: 10,
          },
        },
        tooltip: {
          bodyFont: CHART_FONT,
          titleFont: CHART_FONT,
        },
      },
      cutout: "58%",
    }),
    [],
  );

  const barHOpts = useMemo<ChartOptions<"bar">>(
    () => ({
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { bodyFont: CHART_FONT, titleFont: CHART_FONT },
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: { font: { size: 10, ...CHART_FONT }, color: "#64748b" },
          grid: { color: "rgba(148, 163, 184, 0.2)" },
        },
        y: {
          ticks: { font: { size: 9, ...CHART_FONT }, color: "#475569", maxRotation: 0 },
          grid: { display: false },
        },
      },
    }),
    [],
  );

  const lineOpts = useMemo<ChartOptions<"line">>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: "#475569", font: { size: 11, ...CHART_FONT } },
        },
        tooltip: { bodyFont: CHART_FONT, titleFont: CHART_FONT },
      },
      scales: {
        x: {
          ticks: { font: { size: 10, ...CHART_FONT }, color: "#64748b" },
          grid: { display: false },
        },
        y: {
          beginAtZero: true,
          ticks: { font: { size: 10, ...CHART_FONT }, color: "#64748b" },
          grid: { color: "rgba(148, 163, 184, 0.2)" },
        },
      },
    }),
    [],
  );

  const barVertOpts = useMemo<ChartOptions<"bar">>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { bodyFont: CHART_FONT, titleFont: CHART_FONT },
      },
      scales: {
        x: {
          ticks: { font: { size: 10, ...CHART_FONT }, color: "#64748b" },
          grid: { display: false },
        },
        y: {
          beginAtZero: true,
          ticks: { font: { size: 10, ...CHART_FONT }, color: "#64748b" },
          grid: { color: "rgba(148, 163, 184, 0.2)" },
        },
      },
    }),
    [],
  );

  if (loading && !stats) {
    return (
      <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
        Chargement des graphiques…
      </div>
    );
  }

  if (error) {
    return (
      <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50/80 p-4 text-sm text-rose-800">
        Graphiques indisponibles : {error}
      </div>
    );
  }

  if (!stats || stats.total === 0) {
    return (
      <div className="mb-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-6 text-center text-sm text-slate-500">
        Aucun concessionnaire ne correspond aux filtres — les graphiques s’afficheront dès qu’il y aura des
        données.
      </div>
    );
  }

  const hasAgences = (stats.byAgence?.length ?? 0) > 0;
  const hasProduits = (stats.byProduit?.length ?? 0) > 0;

  return (
    <div className="mb-4 space-y-4">
      {stats.detailTruncated ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Plus de 12&nbsp;000 PDV correspondent aux filtres : la répartition par produit et les créations
          mensuelles ne sont pas calculées. Affinez la recherche ou l’agence pour afficher ces graphiques.
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Statuts PDV</h3>
          <p className="mt-0.5 text-[11px] text-slate-500">Répartition selon filtres actuels ({stats.total} PDV)</p>
          <div className="relative mx-auto mt-2 h-[220px] max-w-[280px]">
            <Doughnut data={doughnutStatut} options={doughnutOpts} />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Bancarisation</h3>
          <p className="mt-0.5 text-[11px] text-slate-500">Non bancarisé / en cours / bancarisé</p>
          <div className="relative mx-auto mt-2 h-[220px] max-w-[280px]">
            <Doughnut data={doughnutBanc} options={doughnutOpts} />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-2">
          <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Volume par agence</h3>
          <p className="mt-0.5 text-[11px] text-slate-500">Jusqu’à 14 agences les plus représentées</p>
          <div className="relative mt-3 h-[min(320px,50vh)] w-full min-h-[200px]">
            {hasAgences ? (
              <Bar data={barAgences} options={barHOpts} />
            ) : (
              <p className="py-12 text-center text-sm text-slate-400">Pas de données par agence.</p>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Créations (6 mois)</h3>
          <p className="mt-0.5 text-[11px] text-slate-500">Date de création en base (UTC)</p>
          <div className="relative mt-3 h-[240px] w-full">
            <Line data={lineCreations} options={lineOpts} />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Produits autorisés</h3>
          <p className="mt-0.5 text-[11px] text-slate-500">Nombre de PDV ayant le produit (cumul possible)</p>
          <div className="relative mt-3 h-[240px] w-full">
            {hasProduits && !stats.detailTruncated ? (
              <Bar data={barProduits} options={barVertOpts} />
            ) : stats.detailTruncated ? (
              <p className="py-12 text-center text-sm text-slate-400">Non disponible (volume trop élevé).</p>
            ) : (
              <p className="py-12 text-center text-sm text-slate-400">Aucun produit sur cet ensemble.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
