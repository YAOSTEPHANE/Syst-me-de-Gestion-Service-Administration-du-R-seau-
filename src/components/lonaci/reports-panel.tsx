"use client";

import { useEffect, useMemo, useState } from "react";
import type { ChartOptions } from "chart.js";
import {
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from "chart.js";
import { Line } from "react-chartjs-2";
import Link from "next/link";

import type { LonaciKpiPayload } from "@/lib/lonaci/lonaci-kpi-types";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

type Period = "daily" | "weekly" | "monthly";
type ReportSummary = {
  period: Period;
  windowLabel?: string;
  dossiers?: { total?: number; createdInWindow?: number };
  contrats?: { actifs?: number; createdInWindow?: number };
  concessionnaires?: { total?: number };
  cautions?: { enAttente?: number; alertesJ10?: number };
  succession?: { ouverts?: number; stale30j?: number };
  pdvIntegrations?: { nonFinalise?: number };
};

export default function ReportsPanel() {
  const [period, setPeriod] = useState<Period>("daily");
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kpi, setKpi] = useState<LonaciKpiPayload | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports/summary?period=${period}`, {
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
  }, [period]);

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

  function flash(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2800);
  }

  function exportCsv() {
    window.open(`/api/reports/export?period=${period}&format=csv`, "_blank");
    flash("Export CSV lancé");
  }

  function printView() {
    window.open(`/rapports/print?period=${period}`, "_blank", "noopener,noreferrer");
    flash("Aperçu imprimable ouvert");
  }

  const urgentHint =
    (kpi?.dossierValidation.cautionsJ10 ?? 0) +
    (kpi?.dossierValidation.successionStale30j ?? 0) +
    (kpi?.dossierValidation.contratSoumisRetard48h ?? 0);

  return (
    <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-amber-50/60 via-white to-sky-50/50 p-6 shadow-sm">
      {toast ? (
        <div className="fixed bottom-5 right-5 z-100 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 shadow-lg">
          {toast}
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-amber-700">LONACI</p>
          <h2 className="text-lg font-semibold text-slate-900">Rapports</h2>
          <p className="mt-0.5 text-xs text-slate-600">Analyse, exports et vue pilotage</p>
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

      <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 text-sm font-medium text-slate-800">Activité récente (7 j.)</div>
        <div className="h-[200px]">
          {kpi ? <Line data={lineData} options={lineOpts} /> : <p className="text-xs text-slate-500">Chargement du graphique…</p>}
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
            onClick={printView}
            className="rounded border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 hover:bg-slate-50"
          >
            Aperçu imprimable (PDF via navigateur)
          </button>
        </div>
      </div>
      <p className="mb-3 text-xs text-slate-600">
        Planification 08h00 : route{" "}
        <code className="text-slate-700">POST /api/cron/daily-jobs</code> avec en-tête{" "}
        <code className="text-slate-700">Authorization: Bearer CRON_SECRET</code>.
      </p>
      {loading ? <p className="text-sm text-slate-500">Chargement...</p> : null}
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      {!loading && !error && summary ? (
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
          <article className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
            <p className="text-[11px] uppercase tracking-wide text-amber-700">Cautions à traiter</p>
            <p className="mt-1 text-base font-semibold text-amber-900">{summary.cautions?.enAttente ?? 0}</p>
          </article>
          <article className="rounded-xl border border-rose-200 bg-rose-50/60 p-3">
            <p className="text-[11px] uppercase tracking-wide text-rose-700">Dossiers succession ouverts</p>
            <p className="mt-1 text-base font-semibold text-rose-900">{summary.succession?.ouverts ?? 0}</p>
          </article>
          <article className="rounded-xl border border-violet-200 bg-violet-50/60 p-3">
            <p className="text-[11px] uppercase tracking-wide text-violet-700">Intégrations PDV non finalisées</p>
            <p className="mt-1 text-base font-semibold text-violet-900">{summary.pdvIntegrations?.nonFinalise ?? 0}</p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-600">Nouveaux dossiers/contrats (période)</p>
            <p className="mt-1 text-base font-semibold text-slate-900">
              {(summary.dossiers?.createdInWindow ?? 0) + (summary.contrats?.createdInWindow ?? 0)}
            </p>
          </article>
        </div>
      ) : null}
    </section>
  );
}
