"use client";

import { useCallback, useEffect, useState } from "react";

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
    setError(null);
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
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

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Monitoring events</h3>
          <p className="text-xs text-slate-600">Journal des alertes critiques (application + infra).</p>
          <p className="mt-1 text-[11px] text-slate-500">
            OPEN: <span className="font-semibold text-amber-700">{openCount}</span> | ACK:{" "}
            <span className="font-semibold text-emerald-700">{ackCount}</span> | TOTAL PAGE:{" "}
            <span className="font-semibold text-slate-700">{items.length}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={codeFilter}
            onChange={(e) => setCodeFilter(e.target.value)}
            placeholder="Filtrer par code (ex: HEALTH_MONGODB_DOWN)"
            className="w-[280px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
            aria-label="Filtrer événements monitoring par code"
          />
          <button
            type="button"
            onClick={() => {
              setPage(1);
              setCodeFilterApplied(codeFilter);
            }}
            className="rounded-lg border border-cyan-600 bg-cyan-50 px-3 py-2 text-xs font-semibold text-cyan-700 hover:bg-cyan-100"
          >
            Filtrer
          </button>
          <select
            value={statusFilter}
            onChange={(e) => {
              setPage(1);
              setStatusFilter(e.target.value as "" | "OPEN" | "ACK");
            }}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
            aria-label="Filtrer événements monitoring par statut"
          >
            <option value="">Tous statuts</option>
            <option value="OPEN">OPEN</option>
            <option value="ACK">ACK</option>
          </select>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Rafraîchir
          </button>
          <button
            type="button"
            onClick={() =>
              window.open(
                `/api/monitoring/events/export?${new URLSearchParams({
                  ...(codeFilterApplied.trim() ? { code: codeFilterApplied.trim() } : {}),
                  ...(statusFilter ? { status: statusFilter } : {}),
                }).toString()}`,
                "_blank",
                "noopener,noreferrer",
              )
            }
            className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100"
          >
            Export PDF
          </button>
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
                  <th className="px-3 py-2">Code</th>
                  <th className="px-3 py-2">Titre</th>
                  <th className="px-3 py-2">Message</th>
                  <th className="px-3 py-2">Statut</th>
                  <th className="px-3 py-2">Cible</th>
                  <th className="px-3 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="text-slate-800">
                {items.map((item) => (
                  <tr key={item.id} className="border-t border-slate-200 bg-white align-top">
                    <td className="px-3 py-2 whitespace-nowrap">{new Date(item.createdAt).toLocaleString("fr-FR")}</td>
                    <td className="px-3 py-2 font-mono">{item.code}</td>
                    <td className="px-3 py-2">{item.title}</td>
                    <td className="px-3 py-2">{item.message}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          item.status === "ACK" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {item.status}
                      </span>
                    </td>
                    <td className="px-3 py-2">{item.roleTarget}</td>
                    <td className="px-3 py-2 text-right">
                      {item.status === "OPEN" ? (
                        <button
                          type="button"
                          disabled={ackingId === item.id}
                          onClick={() => void ackEvent(item.id)}
                          className="rounded border border-emerald-600 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                        >
                          {ackingId === item.id ? "..." : "Marquer traité"}
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-500">
                          Traité {item.ackedAt ? new Date(item.ackedAt).toLocaleString("fr-FR") : ""}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {!items.length ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-4 text-center text-slate-500">
                      Aucun événement.
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
          {total} événement{total > 1 ? "s" : ""}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded border border-slate-300 bg-white px-2 py-1 disabled:opacity-40"
          >
            Précédent
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

