"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BellRing, Check, RefreshCw } from "lucide-react";

import { Badge } from "@/components/lonaci/ui/badge";
import { Button } from "@/components/lonaci/ui/button";
import { FeedbackState, Skeleton } from "@/components/lonaci/ui/feedback-state";
import { SectionHeader } from "@/components/lonaci/ui/headers";
import { Surface } from "@/components/lonaci/ui/surface";
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
  metadata?: Record<string, unknown> | null;
}

async function fetchNotifications(): Promise<{ items: NotificationItem[]; total: number }> {
  const response = await fetch("/api/notifications?page=1&pageSize=12&unreadOnly=true", {
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

  useEffect(() => {
    const handleNotificationRead = (event: Event) => {
      const notificationId = (event as CustomEvent<string>).detail;
      setItems((current) => current.filter((item) => item.id !== notificationId));
      setTotal((current) => Math.max(0, current - 1));
    };
    window.addEventListener(NOTIFICATION_READ_EVENT, handleNotificationRead);
    return () => window.removeEventListener(NOTIFICATION_READ_EVENT, handleNotificationRead);
  }, []);

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
    emitNotificationRead(id);
  }, []);

  const unreadCount = useMemo(() => items.filter((i) => i.readAt === null).length, [items]);

  return (
    <Surface elevated className="lonaci-db-notifications" aria-labelledby="dashboard-notifications-title">
      <SectionHeader
        title={<span id="dashboard-notifications-title">Notifications</span>}
        description="Messages système et rappels métier"
        action={
          <div className="flex flex-wrap items-center gap-2">
            {unreadCount > 0 ? (
              <Badge tone="brand">{unreadCount} non lue{unreadCount > 1 ? "s" : ""}</Badge>
            ) : null}
            <Button variant="secondary" size="sm" leadingIcon={RefreshCw} loading={loading} onClick={() => void load()}>
              Actualiser
            </Button>
          </div>
        }
      />

      {error ? <FeedbackState tone="danger" title="Notifications indisponibles" description={error} /> : null}
      {markReadError ? <FeedbackState tone="danger" title="Mise à jour impossible" description={markReadError} /> : null}

      {loading && items.length === 0 && !error ? (
        <Skeleton lines={3} />
      ) : null}

      {!loading && !error && items.length === 0 ? (
        <FeedbackState
          title="Aucune notification"
          description="Les nouveaux messages système et rappels métier apparaîtront ici."
        />
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
                  {unread ? <BellRing size={16} className="text-orange-600" aria-label="Non lue" /> : null}
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
                    <Badge tone="success"><Check size={14} aria-hidden /> Lu</Badge>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      leadingIcon={Check}
                      onClick={() => void markRead(item.id)}
                    >
                      Marquer lu
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : null}

      {total > items.length ? (
        <p className="lonaci-db-notifications-footer">
          {total} non lues au total — affichage des {items.length} plus récentes.
        </p>
      ) : null}
    </Surface>
  );
}
