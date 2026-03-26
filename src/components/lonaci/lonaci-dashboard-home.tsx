"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { ChartOptions } from "chart.js";
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip,
} from "chart.js";
import { Bar, Doughnut } from "react-chartjs-2";

import DashboardAgencesStrip from "@/components/lonaci/dashboard-agences-strip";
import DashboardDataImportCard from "@/components/lonaci/dashboard-data-import-card";
import DashboardNotifications from "@/components/lonaci/dashboard-notifications";
import { useLonaciKpi } from "@/components/lonaci/lonaci-kpi-context";

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend);

const DONUT_COLORS = ["#2563EB", "#0D9488", "#F59E0B", "#7C3AED", "#64748B"] as const;

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

export default function LonaciDashboardHome() {
  const { kpi, error } = useLonaciKpi();

  const barData = useMemo(() => {
    const rows = kpi?.activity7d ?? [];
    return {
      labels: rows.map((r) => r.label),
      datasets: [
        { label: "Contrats", data: rows.map((r) => r.contracts), backgroundColor: "#2563EB", borderRadius: 3, barThickness: 10 },
        { label: "Cautions", data: rows.map((r) => r.cautions), backgroundColor: "#0D9488", borderRadius: 3, barThickness: 10 },
        { label: "Integrations", data: rows.map((r) => r.integrations), backgroundColor: "#F59E0B", borderRadius: 3, barThickness: 10 },
      ],
    };
  }, [kpi]);

  const donutData = useMemo(() => {
    const slices = kpi?.produitSlices ?? [];
    return {
      labels: slices.map((s) => s.code),
      datasets: [
        {
          data: slices.map((s) => s.count),
          backgroundColor: slices.map((_, i) => DONUT_COLORS[i % DONUT_COLORS.length]),
          borderWidth: 0,
          hoverOffset: 4,
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
      pct: Math.round((row.count / total) * 100),
    }));
  }, [kpi]);

  const barChartOptions = useMemo<ChartOptions<"bar">>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { size: 9 }, color: "#4b6280" },
        },
        y: {
          grid: { color: "rgba(255,255,255,0.05)" },
          ticks: { font: { size: 9 }, color: "#4b6280" },
          beginAtZero: true,
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

  const topPdv = kpi?.topConcessionnairesActifs ?? [];
  const agenceTrends = kpi?.agenceTrends30j ?? [];
  const produitVol = kpi?.produitVolumes30j ?? [];
  const delays = kpi?.dossierDelays30j;
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
    <div className="lonaci-db-dashboard space-y-4">
      <DashboardAgencesStrip items={kpi?.agencesOverview30j ?? null} loading={!kpi && !error} />
      <DashboardNotifications />
      <DashboardDataImportCard />
      {error ? <p className="lonaci-db-error-text">{error}</p> : null}
      {!kpi ? <p className="lonaci-db-muted">Chargement...</p> : null}

      {kpi ? (
        <>
          <section className="relative overflow-hidden rounded-3xl border border-cyan-200 bg-gradient-to-r from-slate-900 via-slate-800 to-cyan-900 p-5 shadow-sm">
            <div className="pointer-events-none absolute -right-14 -top-14 h-44 w-44 rounded-full bg-cyan-300/20 blur-2xl" />
            <div className="pointer-events-none absolute -bottom-16 left-20 h-44 w-44 rounded-full bg-indigo-300/20 blur-2xl" />
            <div className="relative flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="inline-flex rounded-full border border-white/30 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100">
                  Tableau de bord
                </p>
                <h1 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">Pilotage premium des opérations</h1>
                <p className="mt-1 text-sm text-cyan-100/90">
                  Vue consolidée des contrats, cautions, intégrations PDV, alertes critiques et performance réseau.
                </p>
              </div>
              <div className="grid w-full gap-2 sm:grid-cols-2 lg:max-w-[440px]">
                <div className="rounded-xl border border-white/25 bg-white/10 px-3 py-2 text-white">
                  <p className="text-[11px] uppercase tracking-wide text-cyan-100/90">Finalisation contrats</p>
                  <p className="mt-1 text-2xl font-bold">{finalisationRate}%</p>
                </div>
                <div className="rounded-xl border border-white/25 bg-white/10 px-3 py-2 text-white">
                  <p className="text-[11px] uppercase tracking-wide text-cyan-100/90">PDV actifs</p>
                  <p className="mt-1 text-2xl font-bold">{totalActifReseau}</p>
                </div>
                <div className="rounded-xl border border-white/25 bg-white/10 px-3 py-2 text-white">
                  <p className="text-[11px] uppercase tracking-wide text-cyan-100/90">Urgences actives</p>
                  <p className="mt-1 text-2xl font-bold">{urgentCount}</p>
                </div>
                <div className="rounded-xl border border-white/25 bg-white/10 px-3 py-2 text-white">
                  <p className="text-[11px] uppercase tracking-wide text-cyan-100/90">Dossiers en attente</p>
                  <p className="mt-1 text-2xl font-bold">{totalPending}</p>
                </div>
              </div>
            </div>
            <div className="relative mt-3 flex flex-wrap gap-2">
              <Link href="/contrats" className="rounded-full border border-white/30 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20">
                Contrats ({contratsToday})
              </Link>
              <Link href="/cautions" className="rounded-full border border-white/30 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20">
                Cautions ({cautionsToday})
              </Link>
              <Link href="/pdv-integrations" className="rounded-full border border-white/30 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20">
                Intégrations ({pdvToday})
              </Link>
              <Link href="/alertes" className="rounded-full border border-rose-300/40 bg-rose-500/20 px-3 py-1.5 text-xs font-semibold text-rose-100 hover:bg-rose-500/30">
                Alertes critiques
              </Link>
            </div>
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
              <div className="lonaci-db-kpi-foot">Objectif : 20 / mois</div>
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
              <div className="lonaci-db-kpi-foot">{kpi.daily.cautions.enAttente} en attente de validation</div>
            </div>

            <div className="lonaci-db-kpi">
              <div className="lonaci-db-kpi-head">
                <div className="lonaci-db-kpi-label">Intégrations PDV</div>
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
              <div className="lonaci-db-kpi-foot">
                {kpi.dossierValidation.pdvEnCoursRetard5j === 0
                  ? "0 en retard"
                  : `${kpi.dossierValidation.pdvEnCoursRetard5j} intégration(s) > ${pdvDays} j.`}
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
              <div className="lonaci-db-kpi-foot">Sur le réseau ({kpi.daily.concessionnaires.total ?? 0} PDV)</div>
            </div>
          </div>

          <div className="lonaci-db-row-2">
            <div className="lonaci-db-kpi">
              <div className="lonaci-db-flex-between lonaci-db-mb-14">
                <div>
                  <div className="lonaci-db-section-title">Activité — 7 derniers jours</div>
                  <div className="lonaci-db-section-subtitle">Contrats · Cautions · Intégrations</div>
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
              <div className="lonaci-db-chart-wrap">
                <Bar data={barData} options={barChartOptions} />
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
                <Link href="/cautions" className="lonaci-db-abtn lonaci-db-abtn-red lonaci-db-alr-actions">
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
                <Link href="/succession" className="lonaci-db-abtn lonaci-db-abtn-red lonaci-db-alr-actions">
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
                <Link href="/contrats" className="lonaci-db-abtn lonaci-db-abtn-ghost lonaci-db-alr-actions">
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
                  <Link href="/pdv-integrations" className="lonaci-db-abtn lonaci-db-abtn-ghost lonaci-db-alr-actions">
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

          <div className="lonaci-db-row-insights-equal">
            <div className="lonaci-db-kpi lonaci-db-insight-card">
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

            <div className="lonaci-db-kpi lonaci-db-insight-card">
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

          <div className="lonaci-db-kpi lonaci-db-mb-14">
            <div className="lonaci-db-flex-between lonaci-db-mb-12">
              <div>
                <div className="lonaci-db-section-title">Tendances par agence</div>
                <div className="lonaci-db-section-subtitle">Volumes sur 30 j. · contrats, cautions, intégrations PDV</div>
              </div>
            </div>
            <div className="lonaci-db-mini-table-wrap">
              {agenceTrends.length === 0 ? (
                <p className="lonaci-db-muted lonaci-db-fs-10">Aucune activité agrégée sur la période.</p>
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
                    {agenceTrends.map((a, i) => (
                      <tr key={a.agenceId ?? `ag-${i}`}>
                        <td>{a.agenceLabel}</td>
                        <td className="lonaci-db-td-num">{a.contrats30j}</td>
                        <td className="lonaci-db-td-num">{a.cautions30j}</td>
                        <td className="lonaci-db-td-num">{a.integrations30j}</td>
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
                        <td>{p.produitCode}</td>
                        <td className="lonaci-db-td-num">{p.current30d}</td>
                        <td className="lonaci-db-td-num">{p.previous30d}</td>
                        <td className={`lonaci-db-td-num ${trendClass(p.trendPct)}`}>{formatTrendPct(p.trendPct)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

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
                    <Link href="/dossiers" className="lonaci-db-abtn lonaci-db-abtn-blue">
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
                    <Link href="/cautions" className="lonaci-db-abtn lonaci-db-abtn-red">
                      Urgent
                    </Link>
                  </div>
                </div>
                <div className="lonaci-db-pending-row">
                  <div className="lonaci-db-pending-module">
                    <div className="lonaci-db-cell-title">Intégrations PDV</div>
                    <div className="lonaci-db-cell-sub">Finalisation</div>
                  </div>
                  <div className="lonaci-db-pending-metric">
                    <span className="lonaci-db-pending-metric-label">En attente</span>
                    <span className="lonaci-db-pending-metric-val lonaci-db-pending-val-blue">{kpi.dossierValidation.pdvNonFinalise}</span>
                  </div>
                  <div className="lonaci-db-pending-metric">
                    <span className="lonaci-db-pending-metric-label">En retard</span>
                    <span className="lonaci-db-muted">—</span>
                  </div>
                  <div className="lonaci-db-pending-action">
                    <Link href="/pdv-integrations" className="lonaci-db-abtn lonaci-db-abtn-green">
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
                    <div className="lonaci-db-cell-title">Décès &amp; Succession</div>
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
                    <Link href="/succession" className="lonaci-db-abtn lonaci-db-abtn-red">
                      Décision
                    </Link>
                  </div>
                </div>
              </div>
            </div>

            <div className="lonaci-db-kpi lonaci-db-flex-col">
              <div className="lonaci-db-section-title lonaci-db-mb-3">Répartition par produit</div>
              <div className="lonaci-db-section-subtitle lonaci-db-mb-12">Contrats actifs · mois courant</div>
              <div className="lonaci-db-donut-wrap">
                <Doughnut
                  data={donutData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: "68%",
                    plugins: { legend: { display: false } },
                  }}
                />
              </div>
              <div className="lonaci-db-donut-legend">
                {donutLegend.map((row, idx) => (
                  <div
                    key={row.code}
                    className={`lonaci-db-donut-legend-row lonaci-db-donut-legend-tone-${idx % DONUT_COLORS.length}`}
                  >
                    <span className="lonaci-db-donut-legend-dot" />
                    {row.code} <strong>{row.pct}%</strong>
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
