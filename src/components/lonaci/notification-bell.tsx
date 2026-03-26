"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  channel: "IN_APP" | "EMAIL";
  readAt: string | null;
  createdAt: string;
}

interface NotificationApiResponse {
  items: NotificationItem[];
  total: number;
}

async function fetchNotifications(): Promise<NotificationApiResponse> {
  const response = await fetch("/api/notifications?page=1&pageSize=20", {
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("Impossible de charger les notifications");
  }
  return response.json();
}

interface NotificationBellProps {
  /** Classes Tailwind pour le bouton déclencheur (ex. thème clair sur le tableau de bord) */
  triggerClassName?: string;
  /** Contenu du bouton (par défaut « Cloche ») */
  triggerContent?: ReactNode;
}

export default function NotificationBell({ triggerClassName, triggerContent }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [markReadError, setMarkReadError] = useState<string | null>(null);
  const [items, setItems] = useState<NotificationItem[]>([]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchNotifications();
      setItems(data.items);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur de chargement";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function markRead(id: string) {
    setMarkReadError(null);
    const response = await fetch(`/api/notifications/${id}/read`, {
      method: "POST",
      credentials: "include",
    });
    if (!response.ok) {
      setMarkReadError("Impossible de marquer comme lu. Réessayez.");
      return;
    }
    setItems((current) =>
      current.map((item) =>
        item.id === id ? { ...item, readAt: new Date().toISOString() } : item,
      ),
    );
  }

  useEffect(() => {
    void load();
  }, []);

  const unreadCount = useMemo(
    () => items.filter((item) => item.readAt === null).length,
    [items],
  );

  const lightTrigger = Boolean(triggerClassName);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={
          triggerClassName ??
          "relative rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 hover:bg-slate-800"
        }
      >
        {triggerContent ?? "Cloche"}
        {unreadCount > 0 && lightTrigger ? (
          <span
            className="absolute right-[7px] top-[7px] h-[7px] w-[7px] rounded-full border-[1.5px] border-white bg-red-600"
            aria-label={`${unreadCount} non lues`}
          />
        ) : null}
        {unreadCount > 0 && !lightTrigger ? (
          <span className="ml-2 rounded-full bg-emerald-500 px-2 py-0.5 text-xs font-semibold text-emerald-950">
            {unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-10 mt-2 w-[28rem] rounded-xl border border-slate-700 bg-slate-950 p-3 shadow-2xl">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-100">Notifications</p>
            <button
              type="button"
              onClick={() => void load()}
              className="text-xs text-emerald-300 hover:text-emerald-200"
            >
              Actualiser
            </button>
          </div>

          {loading ? <p className="text-sm text-slate-400">Chargement...</p> : null}
          {error ? <p className="text-sm text-rose-300">{error}</p> : null}
          {markReadError ? <p className="text-sm text-rose-300">{markReadError}</p> : null}

          {!loading && !error ? (
            <div className="max-h-80 space-y-2 overflow-auto">
              {items.length === 0 ? (
                <p className="text-sm text-slate-400">Aucune notification.</p>
              ) : (
                items.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-lg border border-slate-800 bg-slate-900/70 p-3"
                  >
                    <p className="text-sm font-semibold text-slate-100">{item.title}</p>
                    <p className="mt-1 text-sm text-slate-300">{item.message}</p>
                    <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                      <span>{new Date(item.createdAt).toLocaleString()}</span>
                      {item.readAt ? (
                        <span className="text-emerald-300">Lu</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void markRead(item.id)}
                          className="text-amber-300 hover:text-amber-200"
                        >
                          Marquer lu
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
