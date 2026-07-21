"use client";

import type { ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { lonaciFetch } from "@/lib/lonaci-client-fetch";
import {
  emitNotificationRead,
  NOTIFICATION_READ_EVENT,
} from "@/lib/lonaci/notification-client-events";

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

function isForcedPasswordChangeRoute() {
  if (typeof window === "undefined") return false;
  const isParametres = window.location.pathname.startsWith("/parametres");
  if (!isParametres) return false;
  const search = new URLSearchParams(window.location.search);
  return search.get("motDePasse") === "obligatoire";
}

async function fetchNotifications(): Promise<NotificationApiResponse> {
  const response = await lonaciFetch("/api/notifications?page=1&pageSize=20");
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
  const panelId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  async function load() {
    if (isForcedPasswordChangeRoute()) {
      setItems([]);
      setLoading(false);
      setError(null);
      return;
    }
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
    const response = await lonaciFetch(`/api/notifications/${id}/read`, {
      method: "POST",
    });
    if (!response.ok) {
      setMarkReadError("Impossible de marquer comme lu. Réessayez.");
      return;
    }
    emitNotificationRead(id);
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const handleNotificationRead = (event: Event) => {
      const notificationId = (event as CustomEvent<string>).detail;
      setItems((current) =>
        current.map((item) =>
          item.id === notificationId ? { ...item, readAt: new Date().toISOString() } : item,
        ),
      );
    };
    window.addEventListener(NOTIFICATION_READ_EVENT, handleNotificationRead);
    return () => window.removeEventListener(NOTIFICATION_READ_EVENT, handleNotificationRead);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const unreadCount = useMemo(
    () => items.filter((item) => item.readAt === null).length,
    [items],
  );

  const lightTrigger = Boolean(triggerClassName);

  return (
    <div className="relative" ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} non lue${unreadCount > 1 ? "s" : ""}` : "Notifications"}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        className={
          triggerClassName ??
          "relative rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 hover:bg-slate-800"
        }
      >
        {triggerContent ?? "Cloche"}
        {unreadCount > 0 && lightTrigger ? (
          <span
            className="absolute right-1.75 top-1.75 h-1.75 w-1.75 rounded-full border-[1.5px] border-white bg-orange-500"
            aria-hidden="true"
          />
        ) : null}
        {unreadCount > 0 && !lightTrigger ? (
          <span className="ml-2 rounded-full bg-emerald-500 px-2 py-0.5 text-xs font-semibold text-emerald-950">
            {unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 z-10 mt-2 w-[min(28rem,calc(100vw-1.5rem))] rounded-xl border border-slate-200 bg-white p-3 text-slate-900 shadow-2xl"
        >
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-900">Notifications</p>
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-1 text-xs font-semibold text-orange-600 hover:text-orange-700"
            >
              <RefreshCw size={13} aria-hidden="true" />
              Actualiser
            </button>
          </div>

          {loading ? <p className="text-sm text-slate-500">Chargement...</p> : null}
          {error ? <p className="text-sm text-rose-700">{error}</p> : null}
          {markReadError ? <p className="text-sm text-rose-700">{markReadError}</p> : null}

          {!loading && !error ? (
            <div className="max-h-80 space-y-2 overflow-auto">
              {items.length === 0 ? (
                <p className="text-sm text-slate-500">Aucune notification.</p>
              ) : (
                items.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                  >
                    <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                    <p className="mt-1 text-sm text-slate-600">{item.message}</p>
                    <div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-500">
                      <span>{new Date(item.createdAt).toLocaleString()}</span>
                      {item.readAt ? (
                        <span className="text-slate-500">Lu</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void markRead(item.id)}
                          className="font-semibold text-orange-600 hover:text-orange-700"
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
