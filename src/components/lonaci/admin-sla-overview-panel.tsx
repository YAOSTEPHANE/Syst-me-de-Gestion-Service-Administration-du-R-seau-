"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type KpiPayload = {
  dossierValidation: {
    contratSoumis: number;
    contratSoumisRetard48h: number;
    cautionsEnAttente: number;
    cautionsJ10: number;
    pdvNonFinalise: number;
    pdvEnCoursRetard5j: number;
    agrementsEnAttente: number;
    agrementsRetard: number;
    successionOuverts: number;
    successionStale30j: number;
  };
  dossierDelays30j: {
    avgSubmitHours: number;
    avgN1Hours: number;
    avgN2Hours: number;
    avgFinalizeHours: number;
    sampleSize: number;
  };
};

type AgenceSlaItem = {
  agenceId: string;
  agenceCode?: string;
  agenceLabel: string;
  contratsPending: number;
  contratsOverdue: number;
  pdvPending: number;
  pdvOverdue: number;
  pendingTotal: number;
  overdueTotal: number;
  overdueRatePct: number;
};

export default function AdminSlaOverviewPanel() {
  const [kpi, setKpi] = useState<KpiPayload | null>(null);
  const [agenceRows, setAgenceRows] = useState<AgenceSlaItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<"ALL" | "OVERDUE">("ALL");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 10, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [kpiRes, agenceRes] = await Promise.all([
        fetch("/api/dashboard/kpi", {
          credentials: "include",
          cache: "no-store",
        }),
        fetch(
          `/api/admin/sla/agences?${new URLSearchParams({
            page: String(page),
            pageSize: String(pageSize),
            status: statusFilter,
          }).toString()}`,
          {
          credentials: "include",
          cache: "no-store",
          },
        ),
      ]);
      if (!kpiRes.ok) {
        const body = (await kpiRes.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? "Chargement SLA impossible");
      }
      if (!agenceRes.ok) {
        const body = (await agenceRes.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? "Chargement SLA agences impossible");
      }
      const kpiPayload = (await kpiRes.json()) as KpiPayload;
      const agencePayload = (await agenceRes.json()) as {
        items?: AgenceSlaItem[];
        pagination?: { page: number; pageSize: number; total: number; totalPages: number };
      };
      setKpi(kpiPayload);
      setAgenceRows(agencePayload.items ?? []);
      setPagination(
        agencePayload.pagination ?? { page, pageSize, total: agencePayload.items?.length ?? 0, totalPages: 1 },
      );
    } catch (e) {
      setKpi(null);
      setAgenceRows([]);
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter]);

  const rows = useMemo(() => {
    if (!kpi) return [];
    return [
      {
        module: "Contrats",
        pending: kpi.dossierValidation.contratSoumis,
        overdue: kpi.dossierValidation.contratSoumisRetard48h,
      },
      {
        module: "Cautions",
        pending: kpi.dossierValidation.cautionsEnAttente,
        overdue: kpi.dossierValidation.cautionsJ10,
      },
      {
        module: "Integrations PDV",
        pending: kpi.dossierValidation.pdvNonFinalise,
        overdue: kpi.dossierValidation.pdvEnCoursRetard5j,
      },
      {
        module: "Agrements",
        pending: kpi.dossierValidation.agrementsEnAttente,
        overdue: kpi.dossierValidation.agrementsRetard,
      },
      {
        module: "Successions",
        pending: kpi.dossierValidation.successionOuverts,
        overdue: kpi.dossierValidation.successionStale30j,
      },
    ];
  }, [kpi]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">SLA de traitement (vue transverse)</h3>
          <p className="text-xs text-slate-600">Suivi des files d'attente et retards, global et par agence.</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "ALL" | "OVERDUE")}
            className="rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700"
            aria-label="Filtrer SLA agences par statut"
          >
            <option value="ALL">Toutes agences</option>
            <option value="OVERDUE">Seulement en retard</option>
          </select>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Rafraichir
          </button>
        </div>
      </div>

      {loading ? <p className="text-xs text-slate-500">Chargement...</p> : null}
      {error ? <p className="mb-2 text-xs text-rose-700">{error}</p> : null}

      {kpi ? (
        <>
          <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">Soumission</p>
              <p className="text-lg font-semibold text-slate-900">{kpi.dossierDelays30j.avgSubmitHours.toFixed(1)} h</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">Validation N1</p>
              <p className="text-lg font-semibold text-slate-900">{kpi.dossierDelays30j.avgN1Hours.toFixed(1)} h</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">Validation N2</p>
              <p className="text-lg font-semibold text-slate-900">{kpi.dossierDelays30j.avgN2Hours.toFixed(1)} h</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">Finalisation</p>
              <p className="text-lg font-semibold text-slate-900">{kpi.dossierDelays30j.avgFinalizeHours.toFixed(1)} h</p>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-600">
                  <tr>
                    <th className="px-3 py-2">Module</th>
                    <th className="px-3 py-2 text-right">En attente</th>
                    <th className="px-3 py-2 text-right">En retard</th>
                  </tr>
                </thead>
                <tbody className="text-slate-800">
                  {rows.map((row) => (
                    <tr key={row.module} className="border-t border-slate-200 bg-white">
                      <td className="px-3 py-2">{row.module}</td>
                      <td className="px-3 py-2 text-right font-medium">{row.pending}</td>
                      <td className="px-3 py-2 text-right font-medium">{row.overdue}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-600">
                  <tr>
                    <th className="px-3 py-2">Agence</th>
                    <th className="px-3 py-2 text-right">Contrats</th>
                    <th className="px-3 py-2 text-right">Contrats retard</th>
                    <th className="px-3 py-2 text-right">PDV</th>
                    <th className="px-3 py-2 text-right">PDV retard</th>
                    <th className="px-3 py-2 text-right">Total attente</th>
                    <th className="px-3 py-2 text-right">Total retard</th>
                    <th className="px-3 py-2 text-right">Taux retard</th>
                  </tr>
                </thead>
                <tbody className="text-slate-800">
                  {agenceRows.map((row) => (
                    <tr key={row.agenceId} className="border-t border-slate-200 bg-white">
                      <td className="px-3 py-2">{row.agenceCode ? `${row.agenceCode} - ${row.agenceLabel}` : row.agenceLabel}</td>
                      <td className="px-3 py-2 text-right">{row.contratsPending}</td>
                      <td className="px-3 py-2 text-right">{row.contratsOverdue}</td>
                      <td className="px-3 py-2 text-right">{row.pdvPending}</td>
                      <td className="px-3 py-2 text-right">{row.pdvOverdue}</td>
                      <td className="px-3 py-2 text-right font-medium">{row.pendingTotal}</td>
                      <td className="px-3 py-2 text-right font-medium">{row.overdueTotal}</td>
                      <td className="px-3 py-2 text-right">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            row.overdueTotal > 0 ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
                          }`}
                        >
                          {row.overdueRatePct}%
                        </span>
                      </td>
                    </tr>
                  ))}
                  {!agenceRows.length ? (
                    <tr>
                      <td colSpan={8} className="px-3 py-4 text-center text-slate-500">
                        Aucune donnee SLA par agence.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-600">
            <span>
              {pagination.total} agence{pagination.total > 1 ? "s" : ""}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded border border-slate-300 bg-white px-2 py-1 disabled:opacity-40"
              >
                Precedent
              </button>
              <span>
                Page {pagination.page}/{pagination.totalPages}
              </span>
              <button
                type="button"
                disabled={page >= pagination.totalPages}
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                className="rounded border border-slate-300 bg-white px-2 py-1 disabled:opacity-40"
              >
                Suivant
              </button>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
