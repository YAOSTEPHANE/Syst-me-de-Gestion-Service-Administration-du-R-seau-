"use client";

import { useCallback, useEffect, useState } from "react";

type RunItem = {
  id: string;
  createdAt: string | null;
  status: string;
  summary: Record<string, unknown> | null;
  artifact: { filename: string; contentType: string } | null;
};

export default function AdminSupervisionRunsPanel() {
  const [items, setItems] = useState<RunItem[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 10, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runningNow, setRunningNow] = useState(false);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      const res = await fetch(`/api/admin/supervision/runs?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? "Chargement des runs impossible");
      }
      const data = (await res.json()) as {
        items?: RunItem[];
        pagination?: { page: number; pageSize: number; total: number; totalPages: number };
      };
      setItems(data.items ?? []);
      setPagination(data.pagination ?? { page, pageSize, total: data.items?.length ?? 0, totalPages: 1 });
    } catch (e) {
      setItems([]);
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Historique des runs supervision</h3>
          <p className="text-xs text-slate-600">Runs cron supervision avec statut et téléchargement de l'artefact.</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          Rafraichir
        </button>
        <button
          type="button"
          disabled={runningNow}
          onClick={async () => {
            setRunningNow(true);
            setError(null);
            setInfoMessage(null);
            try {
              const res = await fetch("/api/admin/supervision/runs/trigger", {
                method: "POST",
                credentials: "include",
              });
              if (!res.ok) {
                const body = (await res.json().catch(() => null)) as { message?: string } | null;
                if (res.status === 409) {
                  setInfoMessage(body?.message ?? "Un run supervision est déjà en cours.");
                  await load();
                  return;
                }
                throw new Error(body?.message ?? "Relance impossible");
              }
              setInfoMessage("Relance supervision exécutée avec succès.");
              await load();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Erreur relance");
            } finally {
              setRunningNow(false);
            }
          }}
          className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
        >
          {runningNow ? "Relance..." : "Relancer maintenant"}
        </button>
      </div>

      {loading ? <p className="text-xs text-slate-500">Chargement...</p> : null}
      {infoMessage ? <p className="mb-2 text-xs text-indigo-700">{infoMessage}</p> : null}
      {error ? <p className="mb-2 text-xs text-rose-700">{error}</p> : null}

      {!loading ? (
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-600">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Statut</th>
                  <th className="px-3 py-2">Format</th>
                  <th className="px-3 py-2">Cautions J+10</th>
                  <th className="px-3 py-2">Successions stale</th>
                  <th className="px-3 py-2 text-right">Fichier</th>
                </tr>
              </thead>
              <tbody className="text-slate-800">
                {items.map((item) => (
                  <tr key={item.id} className="border-t border-slate-200 bg-white">
                    <td className="px-3 py-2">{item.createdAt ? new Date(item.createdAt).toLocaleString("fr-FR") : "—"}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          item.status === "OK"
                            ? "bg-emerald-100 text-emerald-800"
                            : item.status === "ERROR"
                              ? "bg-rose-100 text-rose-800"
                              : item.status === "SKIPPED_HOUR"
                                ? "bg-amber-100 text-amber-800"
                                : item.status === "LOCKED"
                                  ? "bg-orange-100 text-orange-800"
                                : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {item.status}
                      </span>
                    </td>
                    <td className="px-3 py-2">{String(item.summary?.format ?? "—").toUpperCase()}</td>
                    <td className="px-3 py-2">{Number(item.summary?.cautionsJ10 ?? 0)}</td>
                    <td className="px-3 py-2">{Number(item.summary?.successionStale ?? 0)}</td>
                    <td className="px-3 py-2 text-right">
                      {item.artifact ? (
                        <button
                          type="button"
                          onClick={() =>
                            window.open(
                              `/api/admin/supervision/runs/${encodeURIComponent(item.id)}/download`,
                              "_blank",
                              "noopener,noreferrer",
                            )
                          }
                          className="rounded border border-indigo-300 bg-indigo-50 px-2 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100"
                        >
                          Télécharger
                        </button>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                  </tr>
                ))}
                {!items.length ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-4 text-center text-slate-500">
                      Aucun run supervision.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="mt-2 flex items-center justify-between text-xs text-slate-600">
        <span>
          {pagination.total} run{pagination.total > 1 ? "s" : ""}
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
    </section>
  );
}
