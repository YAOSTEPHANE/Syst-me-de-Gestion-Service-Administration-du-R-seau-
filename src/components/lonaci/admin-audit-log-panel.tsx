"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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

function statusBadgeClass(status: AuditStatus): string {
  if (status === "SUCCESS" || status === "ACK") return "bg-emerald-100 text-emerald-800";
  if (status === "FAILED") return "bg-rose-100 text-rose-800";
  return "bg-amber-100 text-amber-800";
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

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Journal d'audit unifie</h3>
          <p className="text-xs text-slate-600">
            Historique consolide des connexions et des evenements de supervision.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Recherche email, code, titre, message"
            className="w-[260px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
            aria-label="Recherche dans le journal d'audit"
          />
          <input
            value={agenceId}
            onChange={(e) => setAgenceId(e.target.value)}
            placeholder="AgenceId pour export supervision"
            className="w-[200px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
            aria-label="Filtre agence pour export supervision"
          />
          <button
            type="button"
            onClick={() => {
              setPage(1);
              setQueryApplied(query);
            }}
            className="rounded-lg border border-cyan-600 bg-cyan-50 px-3 py-2 text-xs font-semibold text-cyan-700 hover:bg-cyan-100"
          >
            Filtrer
          </button>
          <select
            value={sourceFilter}
            onChange={(e) => {
              setPage(1);
              setSourceFilter(e.target.value as "" | AuditSource);
            }}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
            aria-label="Filtrer journal audit par source"
          >
            <option value="">Toutes sources</option>
            <option value="AUTH">AUTH</option>
            <option value="MONITORING">MONITORING</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => {
              setPage(1);
              setStatusFilter(e.target.value as "" | AuditStatus);
            }}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
            aria-label="Filtrer journal audit par statut"
          >
            <option value="">Tous statuts</option>
            <option value="SUCCESS">SUCCESS</option>
            <option value="FAILED">FAILED</option>
            <option value="OPEN">OPEN</option>
            <option value="ACK">ACK</option>
          </select>
          <select
            value={slaStatus}
            onChange={(e) => setSlaStatus(e.target.value as "ALL" | "OVERDUE")}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
            aria-label="Filtrer SLA supervision"
          >
            <option value="ALL">SLA: tous</option>
            <option value="OVERDUE">SLA: en retard</option>
          </select>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Rafraichir
          </button>
          {(["pdf", "csv", "xlsx"] as const).map((format) => (
            <button
              key={format}
              type="button"
              onClick={() =>
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
                )
              }
              className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100"
            >
              Export {format.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {loading ? <p className="text-xs text-slate-500">Chargement...</p> : null}
      {error ? <p className="mb-2 text-xs text-rose-700">{error}</p> : null}

      {!loading ? (
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-600">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Source</th>
                  <th className="px-3 py-2">Statut</th>
                  <th className="px-3 py-2">Code</th>
                  <th className="px-3 py-2">Titre</th>
                  <th className="px-3 py-2">Message</th>
                  <th className="px-3 py-2">Acteur</th>
                  <th className="px-3 py-2">Cible</th>
                </tr>
              </thead>
              <tbody className="text-slate-800">
                {items.map((item) => (
                  <tr key={item.id} className="border-t border-slate-200 bg-white align-top">
                    <td className="px-3 py-2 whitespace-nowrap">{new Date(item.timestamp).toLocaleString("fr-FR")}</td>
                    <td className="px-3 py-2">{item.source}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusBadgeClass(item.status)}`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono">{item.code ?? "—"}</td>
                    <td className="px-3 py-2">{item.title}</td>
                    <td className="px-3 py-2">{item.message}</td>
                    <td className="px-3 py-2">{item.actor ?? "—"}</td>
                    <td className="px-3 py-2">{item.targetRole ?? "—"}</td>
                  </tr>
                ))}
                {!items.length ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-4 text-center text-slate-500">
                      Aucune entree d'audit.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="mt-3 flex items-center justify-between text-xs text-slate-600">
        <span>
          {total} entree{total > 1 ? "s" : ""}
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
            Page {page}/{totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="rounded border border-slate-300 bg-white px-2 py-1 disabled:opacity-40"
          >
            Suivant
          </button>
        </div>
      </div>
    </section>
  );
}
