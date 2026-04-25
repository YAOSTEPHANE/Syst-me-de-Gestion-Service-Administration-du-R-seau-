"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

type TabDef = {
  id: string;
  label: string;
  content: ReactNode;
};

const ACTIVE_TAB_STORAGE_KEY = "lonaci:parametres:active-tab";

const VALID_TAB_IDS = new Set([
  "mon-compte",
  "utilisateurs",
  "referentiels",
  "supervision",
  "restriction",
]);

export default function ParametresTabs({
  comptePanel,
  utilisateursPanel,
  referentielsPanel,
  supervisionPanel,
  restrictionPanel,
  initialTabId,
}: {
  comptePanel: ReactNode;
  utilisateursPanel?: ReactNode;
  referentielsPanel?: ReactNode;
  supervisionPanel?: ReactNode;
  restrictionPanel?: ReactNode;
  /** Onglet à ouvrir (ex. `?tab=referentiels` depuis l’ancienne route /produits). */
  initialTabId?: string | null;
}) {
  const tabs = useMemo<TabDef[]>(() => {
    const items: TabDef[] = [{ id: "mon-compte", label: "Mon compte", content: comptePanel }];

    if (utilisateursPanel) {
      items.push({ id: "utilisateurs", label: "Utilisateurs", content: utilisateursPanel });
    }
    if (referentielsPanel) {
      items.push({ id: "referentiels", label: "Référentiels", content: referentielsPanel });
    }
    if (supervisionPanel) {
      items.push({ id: "supervision", label: "Supervision", content: supervisionPanel });
    }
    if (restrictionPanel) {
      items.push({ id: "restriction", label: "Accès", content: restrictionPanel });
    }
    return items;
  }, [comptePanel, utilisateursPanel, referentielsPanel, supervisionPanel, restrictionPanel]);

  /** Toujours identique SSR / premier rendu client — pas de localStorage ici (sinon erreur d’hydratation). */
  const [activeTabId, setActiveTabId] = useState(() => {
    const first = tabs[0]?.id ?? "mon-compte";
    if (
      initialTabId &&
      VALID_TAB_IDS.has(initialTabId) &&
      tabs.some((t) => t.id === initialTabId)
    ) {
      return initialTabId;
    }
    return first;
  });
  const [supervisionOpenCount, setSupervisionOpenCount] = useState<number | null>(null);
  const [usersTotalCount, setUsersTotalCount] = useState<number | null>(null);

  useEffect(() => {
    if (
      initialTabId &&
      VALID_TAB_IDS.has(initialTabId) &&
      tabs.some((t) => t.id === initialTabId)
    ) {
      return;
    }
    try {
      const stored = window.localStorage.getItem(ACTIVE_TAB_STORAGE_KEY);
      if (stored && tabs.some((t) => t.id === stored)) {
        setActiveTabId(stored);
      }
    } catch {
      /* ignore */
    }
    // Intentionnellement après hydratation : une seule restauration au montage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!tabs.some((tab) => tab.id === activeTabId)) {
      setActiveTabId(tabs[0]?.id ?? "mon-compte");
    }
  }, [activeTabId, tabs]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, activeTabId);
  }, [activeTabId]);

  useEffect(() => {
    let cancelled = false;

    async function loadCounters() {
      const hasSupervisionTab = tabs.some((tab) => tab.id === "supervision");
      const hasUsersTab = tabs.some((tab) => tab.id === "utilisateurs");

      if (hasSupervisionTab) {
        try {
          const res = await fetch("/api/monitoring/events?page=1&pageSize=1&status=OPEN", {
            credentials: "include",
            cache: "no-store",
          });
          if (res.ok) {
            const data = (await res.json()) as { total?: number };
            if (!cancelled) setSupervisionOpenCount(data.total ?? 0);
          }
        } catch {
          if (!cancelled) setSupervisionOpenCount(null);
        }
      } else {
        setSupervisionOpenCount(null);
      }

      if (hasUsersTab) {
        try {
          const res = await fetch("/api/admin/users?status=ALL&page=1&pageSize=1", {
            credentials: "include",
            cache: "no-store",
          });
          if (res.ok) {
            const data = (await res.json()) as { total?: number };
            if (!cancelled) setUsersTotalCount(data.total ?? 0);
          }
        } catch {
          if (!cancelled) setUsersTotalCount(null);
        }
      } else {
        setUsersTotalCount(null);
      }
    }

    void loadCounters();
    return () => {
      cancelled = true;
    };
  }, [tabs]);

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white/80 p-2 shadow-sm">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Sections des paramètres">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-controls={`tabpanel-${tab.id}`}
                onClick={() => setActiveTabId(tab.id)}
                className={`rounded-xl px-3 py-1.5 text-xs font-medium transition ${
                  isActive
                    ? "border border-sky-300 bg-sky-50 text-sky-800 shadow-sm"
                    : "border border-transparent bg-slate-100/70 text-slate-700 hover:bg-slate-200/70"
                }`}
              >
                <span className="inline-flex items-center gap-1.5">
                  {tab.label}
                  {tab.id === "supervision" && supervisionOpenCount != null ? (
                    <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">
                      {supervisionOpenCount}
                    </span>
                  ) : null}
                  {tab.id === "utilisateurs" && usersTotalCount != null ? (
                    <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">
                      {usersTotalCount}
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div role="tabpanel" id={`tabpanel-${activeTab.id}`} aria-live="polite">
        {activeTab.content}
      </div>
    </div>
  );
}
