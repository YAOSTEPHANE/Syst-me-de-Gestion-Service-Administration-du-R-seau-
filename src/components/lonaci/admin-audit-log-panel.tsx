"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Filter, RefreshCw } from "lucide-react";

import { StatusBadge, type Tone } from "@/components/lonaci/ui/badge";
import { Button } from "@/components/lonaci/ui/button";
import { DataTable, type DataTableColumn } from "@/components/lonaci/ui/data-table";
import { FeedbackState, Skeleton } from "@/components/lonaci/ui/feedback-state";
import { FilterBar } from "@/components/lonaci/ui/filter-bar";
import { FormField } from "@/components/lonaci/ui/form-field";
import { SectionHeader } from "@/components/lonaci/ui/headers";
import { Pagination } from "@/components/lonaci/ui/pagination";
import { Surface } from "@/components/lonaci/ui/surface";
type AuditSource = "AUTH" | "MONITORING";
type AuditStatus = "SUCCESS" | "FAILED" | "OPEN" | "ACK";

interface AuditLogItem {
  id: string;
  source: AuditSource;
  timestamp: string;
  status: AuditStatus;
  code: string | null;
  title: string;
  message: string;
  actor: string | null;
  targetRole: string | null;
}

interface AuditLogsResponse {
  items: AuditLogItem[];
  total: number;
  page: number;
  pageSize: number;
}

function statusTone(status: AuditStatus): Tone {
  if (status === "SUCCESS" || status === "ACK") return "success";
  if (status === "FAILED") return "danger";
  return "warning";
}

function sourceLabel(source: AuditSource): string {
  switch (source) {
    case "AUTH":
      return "Authentification";
    case "MONITORING":
      return "Supervision";
    default: {
      const exhaustive: never = source;
      return exhaustive;
    }
  }
}

function statusLabel(status: AuditStatus): string {
  switch (status) {
    case "SUCCESS":
      return "Réussi";
    case "FAILED":
      return "Échoué";
    case "OPEN":
      return "Ouvert";
    case "ACK":
      return "Traité";
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

export default function AdminAuditLogPanel() {
  const [items, setItems] = useState<AuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [sourceFilter, setSourceFilter] = useState<"" | AuditSource>("");
  const [statusFilter, setStatusFilter] = useState<"" | AuditStatus>("");
  const [query, setQuery] = useState("");
  const [queryApplied, setQueryApplied] = useState("");
  const [agenceId, setAgenceId] = useState("");
  const [slaStatus, setSlaStatus] = useState<"ALL" | "OVERDUE">("ALL");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (sourceFilter) params.set("source", sourceFilter);
      if (statusFilter) params.set("status", statusFilter);
      if (queryApplied.trim()) params.set("query", queryApplied.trim());

      const res = await fetch(`/api/admin/audit-logs?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? "Chargement du journal d'audit impossible");
      }
      const data = (await res.json()) as AuditLogsResponse;
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch (e) {
      setItems([]);
      setTotal(0);
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, sourceFilter, statusFilter, queryApplied]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [pageSize, total]);

  const columns: readonly DataTableColumn<AuditLogItem>[] = [
    { id: "date", header: "Date", cell: (item) => <span className="whitespace-nowrap">{new Date(item.timestamp).toLocaleString("fr-FR")}</span> },
    { id: "source", header: "Source", cell: (item) => <StatusBadge tone={item.source === "AUTH" ? "info" : "brand"}>{sourceLabel(item.source)}</StatusBadge> },
    { id: "status", header: "Statut", cell: (item) => <StatusBadge tone={statusTone(item.status)}>{statusLabel(item.status)}</StatusBadge> },
    { id: "code", header: "Code", cell: (item) => <span className="font-mono text-xs">{item.code ?? "—"}</span> },
    { id: "title", header: "Titre", cell: (item) => item.title },
    { id: "message", header: "Message", cell: (item) => item.message },
    { id: "actor", header: "Acteur", cell: (item) => item.actor ?? "—" },
    { id: "target", header: "Cible", cell: (item) => item.targetRole ?? "—" },
  ];

  function exportAudit(format: "pdf" | "csv" | "xlsx") {
    window.open(
      `/api/admin/supervision/export?${new URLSearchParams({
        format,
        ...(sourceFilter ? { source: sourceFilter } : {}),
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(queryApplied.trim() ? { query: queryApplied.trim() } : {}),
        ...(agenceId.trim() ? { agenceId: agenceId.trim() } : {}),
        ...(slaStatus ? { slaStatus } : {}),
      }).toString()}`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  return (
    <Surface elevated aria-labelledby="audit-log-title">
      <SectionHeader title={<span id="audit-log-title">Journal d&apos;audit unifié</span>} description="Historique consolidé des connexions et événements de supervision." />
      <FilterBar
        className="mt-5"
        filters={<div className="grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <FormField label="Recherche" htmlFor="audit-query"><input id="audit-query" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Email, code, titre…" className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" /></FormField>
          <FormField label="Agence pour l’export" htmlFor="audit-agence"><input id="audit-agence" value={agenceId} onChange={(e) => setAgenceId(e.target.value)} placeholder="Identifiant agence" className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" /></FormField>
          <FormField label="Source" htmlFor="audit-source"><select id="audit-source" value={sourceFilter} onChange={(e) => { setPage(1); setSourceFilter(e.target.value as "" | AuditSource); }} className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="">Toutes</option><option value="AUTH">Authentification</option><option value="MONITORING">Supervision</option></select></FormField>
          <FormField label="Statut" htmlFor="audit-status"><select id="audit-status" value={statusFilter} onChange={(e) => { setPage(1); setStatusFilter(e.target.value as "" | AuditStatus); }} className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="">Tous</option><option value="SUCCESS">Réussi</option><option value="FAILED">Échoué</option><option value="OPEN">Ouvert</option><option value="ACK">Traité</option></select></FormField>
          <FormField label="SLA supervision" htmlFor="audit-sla"><select id="audit-sla" value={slaStatus} onChange={(e) => setSlaStatus(e.target.value as "ALL" | "OVERDUE")} className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="ALL">Tous</option><option value="OVERDUE">En retard</option></select></FormField>
        </div>}
        actions={<div className="flex flex-wrap gap-2">
          <Button size="sm" leadingIcon={Filter} onClick={() => { setPage(1); setQueryApplied(query); }}>Appliquer</Button>
          <Button size="sm" variant="secondary" leadingIcon={RefreshCw} onClick={() => void load()}>Rafraîchir</Button>
          {(["pdf", "csv", "xlsx"] as const).map((format) => <Button key={format} size="sm" variant="secondary" leadingIcon={Download} onClick={() => exportAudit(format)}>Export {format.toUpperCase()}</Button>)}
        </div>}
      />
      {error ? <FeedbackState className="mt-4" tone="danger" title="Journal indisponible" description={error} /> : null}
      <div className="mt-5" aria-live="polite" aria-busy={loading}>
        {loading ? <Skeleton lines={8} /> : (
          <DataTable
            rows={items}
            columns={columns}
            rowKey={(item) => item.id}
            caption="Journal d’audit unifié"
            getRowLabel={(item) => `${item.source}, ${item.status}, ${item.title}`}
            emptyState={<FeedbackState title="Aucune entrée d’audit" description="Aucun événement ne correspond aux filtres actifs." />}
            mobileCard={(item) => <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex flex-wrap items-center gap-2"><StatusBadge tone={item.source === "AUTH" ? "info" : "brand"}>{sourceLabel(item.source)}</StatusBadge><StatusBadge tone={statusTone(item.status)}>{statusLabel(item.status)}</StatusBadge></div><p className="mt-3 text-xs text-slate-500">{new Date(item.timestamp).toLocaleString("fr-FR")} · <span className="font-mono">{item.code ?? "Sans code"}</span></p><h3 className="mt-2 font-bold text-[#13213c]">{item.title}</h3><p className="mt-1 text-sm text-slate-600">{item.message}</p><p className="mt-3 text-xs text-slate-500">Acteur : {item.actor ?? "—"} · Cible : {item.targetRole ?? "—"}</p></article>}
          />
        )}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-slate-600">{total} entrée{total > 1 ? "s" : ""}</p><Pagination page={page} pageCount={totalPages} onPageChange={setPage} label="Pages du journal d’audit" /></div>
    </Surface>
  );
}
