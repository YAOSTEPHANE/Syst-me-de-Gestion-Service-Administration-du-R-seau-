"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Timer } from "lucide-react";

import { StatusBadge } from "@/components/lonaci/ui/badge";
import { Button } from "@/components/lonaci/ui/button";
import { DataTable, type DataTableColumn } from "@/components/lonaci/ui/data-table";
import { FeedbackState, Skeleton } from "@/components/lonaci/ui/feedback-state";
import { FilterBar } from "@/components/lonaci/ui/filter-bar";
import { FormField } from "@/components/lonaci/ui/form-field";
import { SectionHeader } from "@/components/lonaci/ui/headers";
import { Pagination } from "@/components/lonaci/ui/pagination";
import { Surface } from "@/components/lonaci/ui/surface";

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

  type ModuleRow = (typeof rows)[number];
  const moduleColumns: readonly DataTableColumn<ModuleRow>[] = [
    { id: "module", header: "Module", cell: (row) => <strong>{row.module}</strong> },
    { id: "pending", header: "En attente", align: "right", cell: (row) => row.pending },
    { id: "overdue", header: "En retard", align: "right", cell: (row) => <StatusBadge tone={row.overdue > 0 ? "warning" : "success"}>{row.overdue}</StatusBadge> },
  ];
  const agenceColumns: readonly DataTableColumn<AgenceSlaItem>[] = [
    { id: "agence", header: "Agence", cell: (row) => row.agenceCode ? `${row.agenceCode} — ${row.agenceLabel}` : row.agenceLabel },
    { id: "contracts", header: "Contrats", align: "right", cell: (row) => row.contratsPending },
    { id: "contractsLate", header: "Contrats retard", align: "right", cell: (row) => row.contratsOverdue },
    { id: "pdv", header: "PDV", align: "right", cell: (row) => row.pdvPending },
    { id: "pdvLate", header: "PDV retard", align: "right", cell: (row) => row.pdvOverdue },
    { id: "pending", header: "Total attente", align: "right", cell: (row) => <strong>{row.pendingTotal}</strong> },
    { id: "late", header: "Total retard", align: "right", cell: (row) => <strong>{row.overdueTotal}</strong> },
    { id: "rate", header: "Taux retard", align: "right", cell: (row) => <StatusBadge tone={row.overdueTotal > 0 ? "warning" : "success"}>{row.overdueRatePct}%</StatusBadge> },
  ];

  return (
    <Surface elevated aria-labelledby="sla-overview-title">
      <SectionHeader title={<span id="sla-overview-title" className="inline-flex items-center gap-2"><Timer size={19} className="text-orange-600" aria-hidden="true" />SLA de traitement</span>} description="Vue transverse des files d’attente et retards, globalement et par agence." />
      <FilterBar className="mt-5" filters={<FormField label="Périmètre agences" htmlFor="sla-status"><select id="sla-status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "ALL" | "OVERDUE")} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="ALL">Toutes les agences</option><option value="OVERDUE">Seulement en retard</option></select></FormField>} actions={<Button size="sm" variant="secondary" leadingIcon={RefreshCw} onClick={() => void load()}>Rafraîchir</Button>} />
      {error ? <FeedbackState className="mt-4" tone="danger" title="SLA indisponibles" description={error} /> : null}
      <div className="mt-5" aria-live="polite" aria-busy={loading}>
        {loading ? <Skeleton lines={8} /> : null}
        {!loading && kpi ? <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Délais moyens sur 30 jours">
            {[
              ["Soumission", kpi.dossierDelays30j.avgSubmitHours],
              ["Validation N1", kpi.dossierDelays30j.avgN1Hours],
              ["Validation N2", kpi.dossierDelays30j.avgN2Hours],
              ["Finalisation", kpi.dossierDelays30j.avgFinalizeHours],
            ].map(([label, value]) => <article key={String(label)} className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{label}</p><p className="mt-2 text-2xl font-black text-[#13213c]">{Number(value).toFixed(1)} h</p></article>)}
          </section>
          <div className="mt-5"><SectionHeader title="Synthèse par module" description={`Échantillon de ${kpi.dossierDelays30j.sampleSize} dossier(s) sur 30 jours.`} /><div className="mt-3"><DataTable rows={rows} columns={moduleColumns} rowKey={(row) => row.module} caption="SLA par module" mobileCard={(row) => <article className="rounded-2xl border border-slate-200 bg-white p-4"><div className="flex items-center justify-between gap-3"><strong className="text-[#13213c]">{row.module}</strong><StatusBadge tone={row.overdue > 0 ? "warning" : "success"}>{row.overdue} en retard</StatusBadge></div><p className="mt-3 text-sm text-slate-600">{row.pending} en attente</p></article>} /></div></div>
          <div className="mt-6"><SectionHeader title="Performance par agence" description={`${pagination.total} agence${pagination.total > 1 ? "s" : ""}`} /><div className="mt-3"><DataTable rows={agenceRows} columns={agenceColumns} rowKey={(row) => row.agenceId} caption="SLA par agence" emptyState={<FeedbackState title="Aucune donnée SLA par agence" description="Aucune agence ne correspond au périmètre sélectionné." />} getRowLabel={(row) => `${row.agenceLabel}, ${row.overdueTotal} retards`} mobileCard={(row) => <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="font-bold text-[#13213c]">{row.agenceLabel}</p>{row.agenceCode ? <p className="font-mono text-xs text-slate-500">{row.agenceCode}</p> : null}</div><StatusBadge tone={row.overdueTotal > 0 ? "warning" : "success"}>{row.overdueRatePct}%</StatusBadge></div><dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-slate-500">Total attente</dt><dd className="font-bold">{row.pendingTotal}</dd></div><div><dt className="text-xs text-slate-500">Total retard</dt><dd className="font-bold">{row.overdueTotal}</dd></div><div><dt className="text-xs text-slate-500">Contrats</dt><dd>{row.contratsPending} · {row.contratsOverdue} retard</dd></div><div><dt className="text-xs text-slate-500">PDV</dt><dd>{row.pdvPending} · {row.pdvOverdue} retard</dd></div></dl></article>} /></div><div className="mt-4 flex justify-end"><Pagination page={page} pageCount={pagination.totalPages} onPageChange={setPage} label="Pages SLA des agences" /></div></div>
        </> : null}
      </div>
    </Surface>
  );
}
