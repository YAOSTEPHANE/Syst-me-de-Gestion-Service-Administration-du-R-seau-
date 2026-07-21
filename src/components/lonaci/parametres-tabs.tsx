"use client";

import { Badge } from "@/components/lonaci/ui/badge";
import { Surface } from "@/components/lonaci/ui/surface";
import {
  BookOpenCheck,
  LockKeyhole,
  SlidersHorizontal,
  UserRound,
  UsersRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";

type TabDef = {
  id: string;
  label: string;
  content: ReactNode;
  icon: LucideIcon;
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
    const items: TabDef[] = [
      { id: "mon-compte", label: "Mon compte", content: comptePanel, icon: UserRound },
    ];

    if (utilisateursPanel) {
      items.push({
        id: "utilisateurs",
        label: "Utilisateurs",
        content: utilisateursPanel,
        icon: UsersRound,
      });
    }
    if (referentielsPanel) {
      items.push({
        id: "referentiels",
        label: "Référentiels",
        content: referentielsPanel,
        icon: BookOpenCheck,
      });
    }
    if (supervisionPanel) {
      items.push({
        id: "supervision",
        label: "Supervision",
        content: supervisionPanel,
        icon: SlidersHorizontal,
      });
    }
    if (restrictionPanel) {
      items.push({
        id: "restriction",
        label: "Accès",
        content: restrictionPanel,
        icon: LockKeyhole,
      });
    }
    return items;
  }, [comptePanel, utilisateursPanel, referentielsPanel, supervisionPanel, restrictionPanel]);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

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
    if (initialTabId && VALID_TAB_IDS.has(initialTabId) && tabs.some((tab) => tab.id === initialTabId)) {
      setActiveTabId(initialTabId);
    }
  }, [initialTabId, tabs]);

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

  function selectTab(tabId: string) {
    setActiveTabId(tabId);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tabId);
    window.history.replaceState(window.history.state, "", url);
  }

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) {
    let nextIndex: number | null = null;

    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
    if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = tabs.length - 1;

    if (nextIndex == null) return;
    event.preventDefault();
    const nextTab = tabs[nextIndex];
    if (!nextTab) return;
    selectTab(nextTab.id);
    tabRefs.current[nextIndex]?.focus();
  }

  return (
    <div className="space-y-5">
      <Surface
        padding="sm"
        elevated
        className="overflow-x-auto border-slate-200 bg-white [scrollbar-width:thin]"
      >
        <div
          className="flex min-w-max gap-1.5"
          role="tablist"
          aria-label="Sections des paramètres"
          aria-orientation="horizontal"
        >
          {tabs.map((tab, index) => {
            const isActive = tab.id === activeTab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                ref={(element) => {
                  tabRefs.current[index] = element;
                }}
                type="button"
                role="tab"
                id={`tab-${tab.id}`}
                aria-controls={`tabpanel-${tab.id}`}
                aria-selected={isActive}
                tabIndex={isActive ? 0 : -1}
                onClick={() => selectTab(tab.id)}
                onKeyDown={(event) => onTabKeyDown(event, index)}
                className={`group relative inline-flex min-h-11 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 ${
                  isActive
                    ? "bg-[#102a43] text-white shadow-md"
                    : "text-slate-600 hover:bg-orange-50 hover:text-[#102a43]"
                }`}
              >
                <Icon
                  size={17}
                  aria-hidden="true"
                  className={isActive ? "text-orange-300" : "text-slate-400 group-hover:text-orange-600"}
                />
                {tab.label}
                {tab.id === "supervision" && supervisionOpenCount != null ? (
                  <Badge tone={supervisionOpenCount > 0 ? "danger" : "neutral"}>
                    {supervisionOpenCount}
                  </Badge>
                ) : null}
                {tab.id === "utilisateurs" && usersTotalCount != null ? (
                  <Badge tone={isActive ? "warning" : "info"}>{usersTotalCount}</Badge>
                ) : null}
                {isActive ? (
                  <span className="absolute inset-x-3 -bottom-1 h-0.5 rounded-full bg-orange-400" />
                ) : null}
              </button>
            );
          })}
        </div>
      </Surface>

      <div
        role="tabpanel"
        id={`tabpanel-${activeTab.id}`}
        aria-labelledby={`tab-${activeTab.id}`}
        tabIndex={0}
        className="outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-4"
      >
        {activeTab.content}
      </div>
    </div>
  );
}
