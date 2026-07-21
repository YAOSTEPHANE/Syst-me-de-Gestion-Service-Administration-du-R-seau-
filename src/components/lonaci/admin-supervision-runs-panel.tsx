"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Play, RefreshCw } from "lucide-react";

import { StatusBadge, type Tone } from "@/components/lonaci/ui/badge";
import { Button } from "@/components/lonaci/ui/button";
import { DataTable, type DataTableColumn } from "@/components/lonaci/ui/data-table";
import { FeedbackState, Skeleton } from "@/components/lonaci/ui/feedback-state";
import { SectionHeader } from "@/components/lonaci/ui/headers";
import { Pagination } from "@/components/lonaci/ui/pagination";
import { Surface } from "@/components/lonaci/ui/surface";
import { notify } from "@/lib/toast";

type RunItem = {
  id: string;
  createdAt: string | null;
  status: string;
  summary: Record<string, unknown> | null;
  artifact: { filename: string; contentType: string } | null;
};

function runTone(status: string): Tone {
  if (status === "OK") return "success";
  if (status === "ERROR") return "danger";
  if (status === "SKIPPED_HOUR" || status === "LOCKED") return "warning";
  return "neutral";
}

function runStatusLabel(status: string): string {
  if (status === "OK") return "Réussi";
  if (status === "ERROR") return "Échoué";
  if (status === "SKIPPED_HOUR") return "Hors plage";
  if (status === "LOCKED") return "Déjà en cours";
  return status;
}

export default function AdminSupervisionRunsPanel() {
  const [items, setItems] = useState<RunItem[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 10, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runningNow, setRunningNow] = useState(false);

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

  const downloadAction = (item: RunItem) =>
    item.artifact ? (
      <Button
        size="sm"
        variant="secondary"
        leadingIcon={Download}
        onClick={() =>
          window.open(
            `/api/admin/supervision/runs/${encodeURIComponent(item.id)}/download`,
            "_blank",
            "noopener,noreferrer",
          )
        }
      >
        Télécharger
      </Button>
    ) : <span className="text-slate-400">—</span>;

  const columns: readonly DataTableColumn<RunItem>[] = [
    { id: "date", header: "Date", cell: (item) => item.createdAt ? new Date(item.createdAt).toLocaleString("fr-FR") : "—" },
    { id: "status", header: "Statut", cell: (item) => <StatusBadge tone={runTone(item.status)}>{runStatusLabel(item.status)}</StatusBadge> },
    { id: "format", header: "Format", cell: (item) => String(item.summary?.format ?? "—").toUpperCase() },
    { id: "cautions", header: "Cautions J+10", align: "right", cell: (item) => Number(item.summary?.cautionsJ10 ?? 0) },
    { id: "successions", header: "Successions sans activité", align: "right", cell: (item) => Number(item.summary?.successionStale ?? 0) },
    { id: "file", header: "Fichier", align: "right", cell: downloadAction },
  ];

  return (
    <Surface elevated aria-labelledby="supervision-runs-title">
      <SectionHeader
        title={<span id="supervision-runs-title">Historique des exécutions</span>}
        description="Exécutions planifiées, statuts et fichiers générés."
        action={<div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" leadingIcon={RefreshCw} onClick={() => void load()}>Rafraîchir</Button>
          <Button
          size="sm"
          loading={runningNow}
          leadingIcon={Play}
          onClick={async () => {
            setRunningNow(true);
            setError(null);
            try {
              const res = await fetch("/api/admin/supervision/runs/trigger", {
                method: "POST",
                credentials: "include",
              });
              if (!res.ok) {
                const body = (await res.json().catch(() => null)) as { message?: string } | null;
                if (res.status === 409) {
                  notify.info(body?.message ?? "Une exécution de supervision est déjà en cours.");
                  await load();
                  return;
                }
                throw new Error(body?.message ?? "Relance impossible");
              }
              notify.success("Relance supervision exécutée avec succès.");
              await load();
            } catch (e) {
              notify.error(e, "Erreur relance");
            } finally {
              setRunningNow(false);
            }
          }}
        >
          {runningNow ? "Relance…" : "Relancer maintenant"}
          </Button>
        </div>}
      />
      {error ? <FeedbackState className="mt-4" tone="danger" title="Historique indisponible" description={error} /> : null}
      <div className="mt-5" aria-live="polite" aria-busy={loading}>
        {loading ? <Skeleton lines={7} /> : (
          <DataTable
            rows={items}
            columns={columns}
            rowKey={(item) => item.id}
            caption="Historique des exécutions de supervision"
            emptyState={<FeedbackState title="Aucune exécution" description="Les prochaines exécutions apparaîtront ici." />}
            getRowLabel={(item) => `Exécution ${item.createdAt ?? "sans date"}, statut ${item.status}`}
            mobileCard={(item) => (
              <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div><p className="text-xs text-slate-500">{item.createdAt ? new Date(item.createdAt).toLocaleString("fr-FR") : "Date inconnue"}</p><p className="mt-1 font-bold text-[#13213c]">{String(item.summary?.format ?? "Format indisponible").toUpperCase()}</p></div>
                  <StatusBadge tone={runTone(item.status)}>{runStatusLabel(item.status)}</StatusBadge>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-slate-500">Cautions J+10</dt><dd className="font-bold">{Number(item.summary?.cautionsJ10 ?? 0)}</dd></div><div><dt className="text-xs text-slate-500">Successions sans activité</dt><dd className="font-bold">{Number(item.summary?.successionStale ?? 0)}</dd></div></dl>
                <div className="mt-4">{downloadAction(item)}</div>
              </article>
            )}
          />
        )}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">{pagination.total} exécution{pagination.total > 1 ? "s" : ""}</p>
        <Pagination page={page} pageCount={pagination.totalPages} onPageChange={setPage} label="Pages des exécutions de supervision" />
      </div>
    </Surface>
  );
}
