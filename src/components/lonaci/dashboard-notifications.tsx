"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  channel: "IN_APP" | "EMAIL";
  readAt: string | null;
  createdAt: string;
  metadata?: Record<string, unknown> | null;
}

async function fetchNotifications(): Promise<{ items: NotificationItem[]; total: number }> {
  const response = await fetch("/api/notifications?page=1&pageSize=12", {
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("Impossible de charger les notifications");
  }
  return response.json();
}

function metadataHref(meta: Record<string, unknown> | null | undefined): string | null {
  if (!meta || typeof meta !== "object") return null;
  const href = meta.href;
  return typeof href === "string" && href.startsWith("/") ? href : null;
}

export default function DashboardNotifications() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [markReadError, setMarkReadError] = useState<string | null>(null);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchNotifications();
      setItems(data.items);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const markRead = useCallback(async (id: string) => {
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
  }, []);

  const unreadCount = useMemo(() => items.filter((i) => i.readAt === null).length, [items]);

  return (
    <section className="lonaci-db-notifications" aria-labelledby="dashboard-notifications-title">
      <div className="lonaci-db-notifications-head">
        <div className="lonaci-db-notifications-head-text">
          <h2 id="dashboard-notifications-title" className="lonaci-db-section-title">
            Notifications
          </h2>
          <p className="lonaci-db-section-subtitle">Messages système et rappels métier</p>
        </div>
        <div className="lonaci-db-notifications-actions">
          {unreadCount > 0 ? (
            <span className="lonaci-db-badge lonaci-db-badge-blue">{unreadCount} non lue{unreadCount > 1 ? "s" : ""}</span>
          ) : null}
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="lonaci-db-notifications-refresh"
          >
            {loading ? "…" : "Actualiser"}
          </button>
        </div>
      </div>

      {error ? <p className="lonaci-db-error-text lonaci-db-notifications-error">{error}</p> : null}
      {markReadError ? <p className="lonaci-db-error-text lonaci-db-notifications-error">{markReadError}</p> : null}

      {loading && items.length === 0 && !error ? (
        <p className="lonaci-db-muted lonaci-db-notifications-loading">Chargement des notifications…</p>
      ) : null}

      {!loading && !error && items.length === 0 ? (
        <p className="lonaci-db-muted lonaci-db-notifications-empty">Aucune notification pour le moment.</p>
      ) : null}

      {items.length > 0 ? (
        <div className="lonaci-db-notifications-track" role="list">
          {items.map((item) => {
            const unread = item.readAt === null;
            const href = metadataHref(item.metadata);
            return (
              <article
                key={item.id}
                role="listitem"
                className={`lonaci-db-notification-card${unread ? " lonaci-db-notification-card--unread" : ""}`}
              >
                <div className="lonaci-db-notification-card-head">
                  {href ? (
                    <Link href={href} className="lonaci-db-notification-title lonaci-db-notification-title-link">
                      {item.title}
                    </Link>
                  ) : (
                    <p className="lonaci-db-notification-title">{item.title}</p>
                  )}
                  {unread ? <span className="lonaci-db-notification-dot" aria-hidden /> : null}
                </div>
                <p className="lonaci-db-notification-message">{item.message}</p>
                <div className="lonaci-db-notification-meta">
                  <time dateTime={item.createdAt} className="lonaci-db-notification-time">
                    {new Date(item.createdAt).toLocaleString("fr-FR", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                  {item.readAt ? (
                    <span className="lonaci-db-notification-read">Lu</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void markRead(item.id)}
                      className="lonaci-db-notification-mark"
                    >
                      Marquer lu
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : null}

      {total > items.length ? (
        <p className="lonaci-db-notifications-footer">
          {total} au total — affichage des {items.length} plus récentes. Utilisez la cloche en haut à droite pour la
          liste complète.
        </p>
      ) : null}
    </section>
  );
}
