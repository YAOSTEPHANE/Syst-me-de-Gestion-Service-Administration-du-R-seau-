"use client";

import { useEffect, useMemo, useState } from "react";
import {
  forceSyncQueuedMutations,
  getQueuedMutationsCount,
  getQueuedMutationsPreview,
  installOfflineMutationQueue,
  offlineQueueEvents,
  removeQueuedMutation,
  syncQueuedMutationById,
  type QueuedMutationPreview,
} from "@/lib/offline/mutation-queue";

export default function OfflineSupport() {
  const [methodFilter, setMethodFilter] = useState<"ALL" | "POST" | "PUT" | "PATCH" | "DELETE">("ALL");
  const [sortMode, setSortMode] = useState<"NEWEST" | "OLDEST" | "RETRIES_DESC">("NEWEST");
  const [isOnline, setIsOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [queuedCount, setQueuedCount] = useState(() =>
    typeof window === "undefined" ? 0 : getQueuedMutationsCount(),
  );
  const [queueItems, setQueueItems] = useState<QueuedMutationPreview[]>(() =>
    typeof window === "undefined" ? [] : getQueuedMutationsPreview(),
  );
  const [syncing, setSyncing] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const filteredQueueItems = useMemo(() => {
    const base =
      methodFilter === "ALL" ? queueItems : queueItems.filter((item) => item.method === methodFilter);
    const sorted = [...base];
    if (sortMode === "OLDEST") {
      sorted.sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
    } else if (sortMode === "RETRIES_DESC") {
      sorted.sort((a, b) => b.retries - a.retries);
    } else {
      sorted.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    }
    return sorted;
  }, [methodFilter, queueItems, sortMode]);

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/sw.js");
  }, []);

  useEffect(() => {
    installOfflineMutationQueue();

    const onQueueChange = (event: Event) => {
      const custom = event as CustomEvent<{ count?: number }>;
      if (typeof custom.detail?.count === "number") {
        setQueuedCount(custom.detail.count);
        setQueueItems(getQueuedMutationsPreview());
        return;
      }
      setQueuedCount(getQueuedMutationsCount());
      setQueueItems(getQueuedMutationsPreview());
    };

    const onSync = (event: Event) => {
      const custom = event as CustomEvent<{ syncing?: boolean; remaining?: number }>;
      setSyncing(Boolean(custom.detail?.syncing));
      if (typeof custom.detail?.remaining === "number") {
        setQueuedCount(custom.detail.remaining);
      }
      setQueueItems(getQueuedMutationsPreview());
    };

    window.addEventListener(offlineQueueEvents.change, onQueueChange as EventListener);
    window.addEventListener(offlineQueueEvents.sync, onSync as EventListener);
    return () => {
      window.removeEventListener(offlineQueueEvents.change, onQueueChange as EventListener);
      window.removeEventListener(offlineQueueEvents.sync, onSync as EventListener);
    };
  }, []);

  if (isOnline && queuedCount === 0 && !syncing) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-50">
      <div
        className={`px-3 py-2 text-center text-xs font-semibold ${
          isOnline ? "bg-sky-600 text-white" : "bg-amber-500 text-black"
        }`}
      >
        {!isOnline ? "Mode hors connexion actif." : "Connexion retablie."}{" "}
        {syncing
          ? "Synchronisation des actions en cours..."
          : queuedCount > 0
            ? `${queuedCount} action(s) en attente de synchronisation.`
            : "Aucune action en attente."}
        {queuedCount > 0 ? (
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            className={`ml-2 rounded border px-2 py-0.5 ${
              isOnline ? "border-white/60 hover:bg-white/10" : "border-black/40 hover:bg-black/10"
            }`}
          >
            {showDetails ? "Masquer details" : "Voir details"}
          </button>
        ) : null}
      </div>
      {showDetails && queuedCount > 0 ? (
        <div className="max-h-56 overflow-auto border-b border-slate-200 bg-white p-2 text-xs shadow">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="font-semibold text-slate-700">Actions en attente</span>
            <div className="flex items-center gap-2">
              <select
                value={methodFilter}
                onChange={(e) =>
                  setMethodFilter(e.target.value as "ALL" | "POST" | "PUT" | "PATCH" | "DELETE")
                }
                className="rounded border border-slate-300 px-2 py-1 text-slate-700"
                aria-label="Filtrer les actions en attente par methode"
              >
                <option value="ALL">Toutes</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="PATCH">PATCH</option>
                <option value="DELETE">DELETE</option>
              </select>
              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as "NEWEST" | "OLDEST" | "RETRIES_DESC")}
                className="rounded border border-slate-300 px-2 py-1 text-slate-700"
                aria-label="Trier les actions en attente"
              >
                <option value="NEWEST">Plus recent</option>
                <option value="OLDEST">Plus ancien</option>
                <option value="RETRIES_DESC">Plus de retries</option>
              </select>
              <button
                type="button"
                disabled={syncing || !isOnline}
                onClick={() => {
                  void forceSyncQueuedMutations();
                }}
                className="rounded border border-slate-300 px-2 py-1 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Forcer la synchronisation
              </button>
            </div>
          </div>
          <p className="mb-2 text-[11px] text-slate-500">
            {filteredQueueItems.length}/{queueItems.length} action(s) affichee(s)
          </p>
          <ul className="space-y-1">
            {filteredQueueItems.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-2 rounded border px-2 py-1">
                <span className="truncate text-slate-700">
                  [{item.method}] {item.path} - {new Date(item.createdAt).toLocaleTimeString("fr-FR")} (r
                  {item.retries}){" "}
                  {item.retries >= 3 ? (
                    <span className="ml-1 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">
                      retries eleves
                    </span>
                  ) : null}
                </span>
                <button
                  type="button"
                  disabled={!isOnline || syncing}
                  onClick={() => {
                    void syncQueuedMutationById(item.id).then(() => {
                      setQueuedCount(getQueuedMutationsCount());
                      setQueueItems(getQueuedMutationsPreview());
                    });
                  }}
                  className="rounded border border-emerald-200 px-2 py-0.5 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                >
                  Rejouer
                </button>
                <button
                  type="button"
                  onClick={() => {
                    removeQueuedMutation(item.id);
                    setQueuedCount(getQueuedMutationsCount());
                    setQueueItems(getQueuedMutationsPreview());
                  }}
                  className="rounded border border-rose-200 px-2 py-0.5 text-rose-700 hover:bg-rose-50"
                >
                  Annuler
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
