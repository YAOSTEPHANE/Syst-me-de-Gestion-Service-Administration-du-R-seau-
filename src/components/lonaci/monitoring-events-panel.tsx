"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCheck, Download, Filter, RefreshCw } from "lucide-react";

import { StatusBadge } from "@/components/lonaci/ui/badge";
import { Button } from "@/components/lonaci/ui/button";
import { DataTable, type DataTableColumn } from "@/components/lonaci/ui/data-table";
import { FeedbackState, Skeleton } from "@/components/lonaci/ui/feedback-state";
import { FilterBar } from "@/components/lonaci/ui/filter-bar";
import { FormField } from "@/components/lonaci/ui/form-field";
import { SectionHeader } from "@/components/lonaci/ui/headers";
import { Pagination } from "@/components/lonaci/ui/pagination";
import { Surface } from "@/components/lonaci/ui/surface";
import { notify } from "@/lib/toast";

interface MonitoringEventItem {
  id: string;
  code: string;
  title: string;
  message: string;
  level: "CRITICAL";
  status: "OPEN" | "ACK";
  ackedAt: string | null;
  ackedByUserId: string | null;
  roleTarget: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface MonitoringEventsResponse {
  items: MonitoringEventItem[];
  total: number;
  page: number;
  pageSize: number;
}

export default function MonitoringEventsPanel() {
  const [items, setItems] = useState<MonitoringEventItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [codeFilter, setCodeFilter] = useState("");
  const [codeFilterApplied, setCodeFilterApplied] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "OPEN" | "ACK">("");
  const [loading, setLoading] = useState(false);
  const [ackingId, setAckingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (codeFilterApplied.trim()) params.set("code", codeFilterApplied.trim());
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`/api/monitoring/events?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? "Chargement monitoring impossible");
      }
      const data = (await res.json()) as MonitoringEventsResponse;
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch (e) {
      setItems([]);
      setTotal(0);
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, codeFilterApplied, statusFilter]);

  async function ackEvent(id: string) {
    setAckingId(id);
    try {
      const res = await fetch(`/api/monitoring/events/${encodeURIComponent(id)}/ack`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? "Impossible de marquer traité");
      }
      await load();
      notify.success("Événement marqué comme traité.");
    } catch (e) {
      notify.error(e, "Impossible de marquer l’événement comme traité.");
    } finally {
      setAckingId(null);
    }
  }

  useEffect(() => {
    void load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const openCount = items.filter((item) => item.status === "OPEN").length;
  const ackCount = items.filter((item) => item.status === "ACK").length;

  const ackAction = (item: MonitoringEventItem) =>
    item.status === "OPEN" ? (
      <Button size="sm" leadingIcon={CheckCheck} loading={ackingId === item.id} onClick={() => void ackEvent(item.id)}>
        Marquer traité
      </Button>
    ) : <span className="text-xs text-slate-500">Traité {item.ackedAt ? new Date(item.ackedAt).toLocaleString("fr-FR") : ""}</span>;

  const columns: readonly DataTableColumn<MonitoringEventItem>[] = [
    { id: "date", header: "Date", cell: (item) => <span className="whitespace-nowrap">{new Date(item.createdAt).toLocaleString("fr-FR")}</span> },
    { id: "code", header: "Code", cell: (item) => <span className="font-mono text-xs">{item.code}</span> },
    { id: "title", header: "Titre", cell: (item) => item.title },
    { id: "message", header: "Message", cell: (item) => item.message },
    { id: "status", header: "Statut", cell: (item) => <StatusBadge tone={item.status === "ACK" ? "success" : "warning"}>{item.status === "ACK" ? "Traité" : "Ouvert"}</StatusBadge> },
    { id: "target", header: "Cible", cell: (item) => item.roleTarget },
    { id: "action", header: "Action", align: "right", cell: ackAction },
  ];

  return (
    <Surface elevated aria-labelledby="monitoring-events-title">
      <SectionHeader
        title={<span id="monitoring-events-title">Événements de supervision</span>}
        description="Journal des alertes critiques applicatives et infrastructure."
        action={<div className="flex gap-2"><StatusBadge tone="warning">Ouverts {openCount}</StatusBadge><StatusBadge tone="success">Traités {ackCount}</StatusBadge><StatusBadge>{items.length} sur cette page</StatusBadge></div>}
      />
      <FilterBar
        className="mt-5"
        filters={<div className="grid w-full gap-3 sm:grid-cols-2">
          <FormField label="Code événement" htmlFor="monitoring-code"><input id="monitoring-code" value={codeFilter} onChange={(e) => setCodeFilter(e.target.value)} placeholder="Ex. HEALTH_MONGODB_DOWN" className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" /></FormField>
          <FormField label="Statut" htmlFor="monitoring-status"><select id="monitoring-status" value={statusFilter} onChange={(e) => { setPage(1); setStatusFilter(e.target.value as "" | "OPEN" | "ACK"); }} className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="">Tous</option><option value="OPEN">Ouvert</option><option value="ACK">Traité</option></select></FormField>
        </div>}
        actions={<div className="flex flex-wrap gap-2">
          <Button size="sm" leadingIcon={Filter} onClick={() => { setPage(1); setCodeFilterApplied(codeFilter); }}>Appliquer</Button>
          <Button size="sm" variant="secondary" leadingIcon={RefreshCw} onClick={() => void load()}>Rafraîchir</Button>
          <Button size="sm" variant="secondary" leadingIcon={Download} onClick={() => window.open(`/api/monitoring/events/export?${new URLSearchParams({ ...(codeFilterApplied.trim() ? { code: codeFilterApplied.trim() } : {}), ...(statusFilter ? { status: statusFilter } : {}) }).toString()}`, "_blank", "noopener,noreferrer")}>Export PDF</Button>
        </div>}
      />
      {error ? <FeedbackState className="mt-4" tone="danger" title="Supervision indisponible" description={error} /> : null}
      <div className="mt-5" aria-live="polite" aria-busy={loading}>
        {loading ? <Skeleton lines={8} /> : (
          <DataTable
            rows={items}
            columns={columns}
            rowKey={(item) => item.id}
            caption="Événements critiques de supervision"
            getRowLabel={(item) => `${item.code}, ${item.status}, ${item.title}`}
            emptyState={<FeedbackState title="Aucun événement" description="Aucune alerte ne correspond aux filtres actifs." />}
            mobileCard={(item) => <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-xs text-orange-700">{item.code}</p><h3 className="mt-1 font-bold text-[#13213c]">{item.title}</h3></div><StatusBadge tone={item.status === "ACK" ? "success" : "warning"}>{item.status === "ACK" ? "Traité" : "Ouvert"}</StatusBadge></div><p className="mt-3 text-sm text-slate-600">{item.message}</p><p className="mt-3 text-xs text-slate-500">{new Date(item.createdAt).toLocaleString("fr-FR")} · Cible : {item.roleTarget}</p><div className="mt-4">{ackAction(item)}</div></article>}
          />
        )}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-slate-600">{total} événement{total > 1 ? "s" : ""}</p><Pagination page={page} pageCount={totalPages} onPageChange={setPage} label="Pages des événements de monitoring" /></div>
    </Surface>
  );
}

