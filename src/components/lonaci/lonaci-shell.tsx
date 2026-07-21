"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Menu,
  Search,
  Star,
  UserRound,
  UserRoundPlus,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { LonaciKpiProvider, useLonaciKpi } from "@/components/lonaci/lonaci-kpi-context";
import {
  LONACI_NAV,
  LonaciNavIcon,
  isLonaciNavItemActive,
  lonaciNavBadgeClass,
  type LonaciNavItem,
} from "@/components/lonaci/lonaci-nav";
import NotificationBell from "@/components/lonaci/notification-bell";
import ShellAgenceFilterDropdown from "@/components/lonaci/shell-agence-filter-dropdown";
import { LonaciBrand } from "@/components/lonaci/ui/brand";
import { IconButton } from "@/components/lonaci/ui/button";
import { canRole, type RbacAction, type RbacResource } from "@/lib/auth/rbac";
import { LONACI_ROLES, getLonaciRoleLabel, type LonaciRole } from "@/lib/lonaci/constants";
import { lonaciShellHeader } from "@/lib/lonaci/lonaci-shell-header";

const SIDEBAR_STORAGE_KEY = "lonaci-sidebar-collapsed";
const SIDEBAR_STORE_EVENT = "lonaci:sidebar-collapsed";
const RECENT_MODULES_STORAGE_KEY = "lonaci:recent-modules";
const FAVORITE_MODULES_STORAGE_KEY = "lonaci:favorite-modules";

function subscribeSidebarCollapsed(onStoreChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === SIDEBAR_STORAGE_KEY || event.key === null) onStoreChange();
  };
  const onLocal = () => onStoreChange();
  window.addEventListener("storage", onStorage);
  window.addEventListener(SIDEBAR_STORE_EVENT, onLocal);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(SIDEBAR_STORE_EVENT, onLocal);
  };
}

function getSidebarCollapsedSnapshot(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Réponses 401 de `requireApiAuth` : session remplacée, expirée ou cookie absent — renvoyer vers la connexion. */
const API_SESSION_REDIRECT_CODES = new Set([
  "INVALID_SESSION_ID",
  "SESSION_INACTIVITY_TIMEOUT",
  "AUTH_MISSING_SESSION",
]);

const API_PASSWORD_ROTATION_CODE = "PASSWORD_ROTATION_REQUIRED";

const NAV_RBAC_RULES: Partial<Record<string, { resource: RbacResource; action: RbacAction }>> = {
  "/concessionnaires": { resource: "CONCESSIONNAIRES", action: "READ" },
  "/clients": { resource: "CLIENTS", action: "READ" },
  "/agrements": { resource: "AGREMENTS", action: "READ" },
  "/cautions": { resource: "CAUTIONS", action: "READ" },
  "/contrats": { resource: "CONTRATS", action: "READ" },
  "/dossiers": { resource: "DOSSIERS", action: "READ" },
  "/pdv-integrations": { resource: "PDV_INTEGRATIONS", action: "READ" },
  "/cessions": { resource: "CESSIONS", action: "READ" },
  "/rapports": { resource: "REPORTS", action: "READ" },
  "/alertes": { resource: "ALERTS", action: "READ" },
};

function LonaciShellChrome({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const apiFetchGuardRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || apiFetchGuardRef.current) return;
    apiFetchGuardRef.current = true;
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const res = await nativeFetch(input, init);
      const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
      const requestUrl =
        typeof input === "string" ? input : input instanceof Request ? input.url : input.toString();
      if (res.ok && !["GET", "HEAD", "OPTIONS"].includes(method)) {
        try {
          const apiUrl = new URL(requestUrl, window.location.origin);
          if (apiUrl.origin === window.location.origin && apiUrl.pathname.startsWith("/api/")) {
            window.dispatchEvent(new Event("lonaci:data-changed"));
          }
        } catch {
          // Une URL non analysable ne doit pas faire échouer la requête métier.
        }
      }
      if (res.status !== 401 && res.status !== 403) return res;
      const url =
        typeof input === "string" ? input : input instanceof Request ? input.url : input.toString();
      let apiPath = "";
      try {
        apiPath = new URL(url, window.location.origin).pathname;
      } catch {
        return res;
      }
      if (!apiPath.startsWith("/api/") || apiPath.startsWith("/api/auth/login")) {
        return res;
      }
      try {
        const ct = res.headers.get("content-type");
        if (!ct?.includes("application/json")) return res;
        const body = (await res.clone().json()) as { code?: string };
        if (res.status === 403 && body?.code === API_PASSWORD_ROTATION_CODE) {
          window.location.assign("/parametres?motDePasse=obligatoire");
          return res;
        }
        if (res.status === 401 && body?.code && API_SESSION_REDIRECT_CODES.has(body.code)) {
          window.location.assign("/login");
        }
      } catch {
        return res;
      }
      return res;
    };
    return () => {
      window.fetch = nativeFetch;
      apiFetchGuardRef.current = false;
    };
  }, []);
  const { kpi, refresh: refreshKpi } = useLonaciKpi();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsedState] = useState(false);

  useEffect(() => {
    const syncPreference = () => setSidebarCollapsedState(getSidebarCollapsedSnapshot());
    syncPreference();
    return subscribeSidebarCollapsed(syncPreference);
  }, []);

  const setSidebarCollapsed = useCallback((next: boolean) => {
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? "1" : "0");
    } catch {
      // Ignorer les erreurs d'écriture localStorage en environnement restreint.
    }
    window.dispatchEvent(new Event(SIDEBAR_STORE_EVENT));
  }, []);
  const [agenceKey, setAgenceKey] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const [meUser, setMeUser] = useState<{ role: string; prenom: string; nom: string } | null>(null);
  const [navQuery, setNavQuery] = useState("");
  const [recentModuleHrefs, setRecentModuleHrefs] = useState<string[]>([]);
  const [favoriteModuleHrefs, setFavoriteModuleHrefs] = useState<string[]>([]);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const userMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const mobileMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const mobileDrawerRef = useRef<HTMLElement | null>(null);
  const inactivityTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "b";
      if (!isShortcut) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      event.preventDefault();
      setSidebarCollapsed(!getSidebarCollapsedSnapshot());
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setSidebarCollapsed]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const drawer = mobileDrawerRef.current;
    const opener = mobileMenuButtonRef.current;
    const previousActive = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusableSelector =
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusFirst = () => {
      const first = drawer?.querySelector<HTMLElement>(focusableSelector);
      first?.focus();
    };
    const frame = window.requestAnimationFrame(focusFirst);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobileMenuOpen(false);
        return;
      }
      if (event.key !== "Tab" || !drawer) return;
      const focusable = Array.from(drawer.querySelectorAll<HTMLElement>(focusableSelector));
      if (focusable.length === 0) {
        event.preventDefault();
        drawer.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKeyDown);
      (previousActive ?? opener)?.focus();
    };
  }, [mobileMenuOpen]);

  useEffect(() => {
    const body = document.body;
    if (mobileMenuOpen) {
      body.classList.add("lonaci-db-no-scroll");
      return () => body.classList.remove("lonaci-db-no-scroll");
    }
    body.classList.remove("lonaci-db-no-scroll");
    return undefined;
  }, [mobileMenuOpen]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include", cache: "no-store" });
        if (!res.ok) throw new Error("Profil indisponible");
        const data = (await res.json()) as {
          user: { role: string; prenom: string; nom: string; needsPasswordChange?: boolean };
        };
        setMeUser({
          role: data.user.role,
          prenom: data.user.prenom ?? "",
          nom: data.user.nom ?? "",
        });
        if (data.user.needsPasswordChange) {
          const p = window.location.pathname;
          if (!p.startsWith("/parametres") && !p.startsWith("/login")) {
            router.replace("/parametres?motDePasse=obligatoire");
          }
        }
      } catch {
        setMeUser({ role: "", prenom: "", nom: "" });
      }
    })();
  }, [router]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(RECENT_MODULES_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return;
      setRecentModuleHrefs(parsed.filter((value): value is string => typeof value === "string").slice(0, 6));
    } catch {
      // Ignore invalid storage payloads.
    }
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(FAVORITE_MODULES_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return;
      setFavoriteModuleHrefs(parsed.filter((value): value is string => typeof value === "string").slice(0, 10));
    } catch {
      // Ignore invalid storage payloads.
    }
  }, []);

  const { title, sub } = lonaciShellHeader(pathname ?? "/", kpi, agenceKey);

  const navItems = useMemo(() => {
    const roleRaw = meUser?.role ?? "";
    const role = LONACI_ROLES.includes(roleRaw as LonaciRole) ? (roleRaw as LonaciRole) : null;
    const visibleNav = LONACI_NAV.filter((item) => {
      if (role === "DISPATCHER") {
        return item.href === "/dispatcher" || item.href === "/parametres";
      }
      if (item.href === "/dispatcher") return false;
      const rule = NAV_RBAC_RULES[item.href];
      if (!rule || !role) return true;
      return canRole({ role, resource: rule.resource, action: rule.action }).allowed;
    });
    return visibleNav.map((item: LonaciNavItem) => {
      const active = !item.disabled && isLonaciNavItemActive(pathname ?? "/", item.href);
      let badgeCount: number | null = null;
      if (kpi && item.badge === "dossiers") badgeCount = kpi.workflowQueues.dossiers;
      if (kpi && item.badge === "cautions") badgeCount = kpi.workflowQueues.cautions;
      if (kpi && item.badge === "succession") badgeCount = kpi.workflowQueues.successions;
      if (kpi && item.badge === "pdv") badgeCount = kpi.dossierValidation.pdvNonFinalise;
      if (kpi && item.badge === "agrements") badgeCount = kpi.workflowQueues.agrements;
      if (kpi && item.badge === "bancarisation") badgeCount = kpi.workflowQueues.bancarisation;
      return { item, active, badgeCount };
    });
  }, [pathname, kpi, meUser?.role]);

  const filteredNavItems = useMemo(() => {
    const query = navQuery.trim().toLowerCase();
    const base =
      query.length === 0
        ? navItems
        : navItems.filter(({ item }) => {
            const inLabel = item.label.toLowerCase().includes(query);
            const inSection = item.section?.toLowerCase().includes(query) ?? false;
            return inLabel || inSection;
          });

    let last = "";
    return base.map((entry) => {
      const showSection = Boolean(entry.item.section && entry.item.section !== last);
      if (entry.item.section) last = entry.item.section;
      return { ...entry, showSection };
    });
  }, [navItems, navQuery]);

  const recentModules = useMemo(
    () =>
      recentModuleHrefs
        .map((href) => navItems.find((entry) => entry.item.href === href))
        .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)),
    [navItems, recentModuleHrefs],
  );

  const favoriteModules = useMemo(
    () =>
      favoriteModuleHrefs
        .map((href) => navItems.find((entry) => entry.item.href === href))
        .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)),
    [navItems, favoriteModuleHrefs],
  );

  const rememberRecentModule = useCallback((href: string) => {
    setRecentModuleHrefs((prev) => {
      const next = [href, ...prev.filter((item) => item !== href)].slice(0, 6);
      try {
        window.localStorage.setItem(RECENT_MODULES_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore localStorage write errors.
      }
      return next;
    });
  }, []);

  const toggleFavoriteModule = useCallback((href: string) => {
    setFavoriteModuleHrefs((prev) => {
      const exists = prev.includes(href);
      const next = exists ? prev.filter((item) => item !== href) : [href, ...prev].slice(0, 10);
      try {
        window.localStorage.setItem(FAVORITE_MODULES_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore localStorage write errors.
      }
      return next;
    });
  }, []);

  const handleLogout = useCallback(async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    setUserMenuOpen(false);
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } finally {
      // Une fois la session vidée, on redirige vers la page de connexion.
      router.replace("/login");
      router.refresh();
    }
  }, [loggingOut, router]);

  useEffect(() => {
    const INACTIVITY_MS = 30 * 60 * 1000;

    const resetTimer = () => {
      if (inactivityTimeoutRef.current != null) {
        window.clearTimeout(inactivityTimeoutRef.current);
      }
      inactivityTimeoutRef.current = window.setTimeout(() => {
        void handleLogout();
      }, INACTIVITY_MS);
    };

    const activityEvents: Array<keyof WindowEventMap> = [
      "mousemove",
      "mousedown",
      "keydown",
      "scroll",
      "touchstart",
      "pointerdown",
    ];

    for (const ev of activityEvents) {
      window.addEventListener(ev, resetTimer, { passive: true });
    }
    resetTimer();

    return () => {
      for (const ev of activityEvents) {
        window.removeEventListener(ev, resetTimer);
      }
      if (inactivityTimeoutRef.current != null) {
        window.clearTimeout(inactivityTimeoutRef.current);
      }
    };
  }, [handleLogout]);

  useEffect(() => {
    if (!userMenuOpen) return;
    const firstItem = userMenuRef.current?.querySelector<HTMLElement>('[role="menuitem"]');
    firstItem?.focus();

    const onMouseDown = (event: MouseEvent) => {
      const el = userMenuRef.current;
      if (!el) return;
      const target = event.target as Node;
      if (el.contains(target)) return;
      setUserMenuOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setUserMenuOpen(false);
        userMenuButtonRef.current?.focus();
      }
    };

    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [userMenuOpen]);

  const bare = pathname?.startsWith("/rapports/print") ?? false;
  if (bare) {
    return <>{children}</>;
  }

  const initials =
    meUser && (meUser.prenom || meUser.nom)
      ? `${meUser.prenom?.[0] ?? ""}${meUser.nom?.[0] ?? ""}`.toUpperCase()
      : "KD";

  const roleLabel = getLonaciRoleLabel(meUser?.role);

  return (
    <div className={sidebarCollapsed ? "lonaci-db-app lonaci-db-sidebar-collapsed" : "lonaci-db-app"}>
      <div className="lonaci-db-layout">
        <aside className="lonaci-db-sidebar">
          <div className="lonaci-db-sidebar-brand">
            <div className="lonaci-db-sidebar-brand-inner">
              <LonaciBrand inverse compact={sidebarCollapsed} />
              <IconButton
                icon={sidebarCollapsed ? ChevronRight : ChevronLeft}
                label={sidebarCollapsed ? "Déplier le menu" : "Replier le menu"}
                className="lonaci-db-sidebar-toggle"
                title={`${sidebarCollapsed ? "Déplier" : "Replier"} le menu (Ctrl/Cmd+B)`}
                onClick={() => setSidebarCollapsed(!getSidebarCollapsedSnapshot())}
              />
            </div>
          </div>

          <nav className="lonaci-db-nav">
            {!sidebarCollapsed ? (
              <div className="lonaci-db-nav-search">
                <Search size={15} aria-hidden="true" />
                <input
                  value={navQuery}
                  onChange={(e) => setNavQuery(e.target.value)}
                  placeholder="Rechercher un module..."
                  aria-label="Rechercher un module"
                />
              </div>
            ) : null}
            {!sidebarCollapsed && recentModules.length > 0 ? (
              <div className="lonaci-db-nav-shortcuts">
                <div className="lonaci-db-nav-shortcuts-title">Récents</div>
                <div className="lonaci-db-nav-shortcuts-list">
                  {recentModules.slice(0, 4).map(({ item }) => (
                    <Link
                      key={`recent-${item.href}`}
                      href={item.href}
                      onClick={() => rememberRecentModule(item.href)}
                      className="lonaci-db-nav-shortcut"
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
            {!sidebarCollapsed && favoriteModules.length > 0 ? (
              <div className="lonaci-db-nav-shortcuts">
                <div className="lonaci-db-nav-shortcuts-title">Favoris</div>
                <div className="lonaci-db-nav-shortcuts-list">
                  {favoriteModules.slice(0, 6).map(({ item }) => (
                    <Link
                      key={`favorite-${item.href}`}
                      href={item.href}
                      onClick={() => rememberRecentModule(item.href)}
                      className="lonaci-db-nav-shortcut lonaci-db-nav-shortcut--favorite"
                    >
                      ★ {item.label}
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
            {filteredNavItems.map(({ item, showSection, active, badgeCount }) => (
              <div key={`${item.href}-${item.label}`}>
                {!sidebarCollapsed && showSection ? <div className="lonaci-db-nav-section">{item.section}</div> : null}
                {item.disabled ? (
                  <span className="lonaci-db-nav-item lonaci-db-nav-item-disabled" title={sidebarCollapsed ? item.label : undefined}>
                    <LonaciNavIcon icon={item.icon} color={item.iconColor} />
                    <span className="lonaci-db-nav-label">{item.label}</span>
                  </span>
                ) : (
                  <div className="lonaci-db-nav-row">
                    <Link
                      href={item.href}
                      className={active ? "lonaci-db-nav-item lonaci-db-active" : "lonaci-db-nav-item"}
                      title={sidebarCollapsed ? item.label : undefined}
                      aria-current={active ? "page" : undefined}
                      onClick={() => rememberRecentModule(item.href)}
                    >
                      <LonaciNavIcon icon={item.icon} color={item.iconColor} />
                      <span className="lonaci-db-nav-label">{item.label}</span>
                      {active && item.href === "/dashboard" ? <span className="lonaci-db-nav-active-dot" /> : null}
                      {badgeCount && badgeCount > 0 && item.badge ? (
                        <span className={`lonaci-db-nav-badge ${lonaciNavBadgeClass(item.badge)}`}>{badgeCount}</span>
                      ) : null}
                    </Link>
                    {!sidebarCollapsed ? (
                      <button
                        type="button"
                        className="lonaci-db-nav-favorite"
                        title={favoriteModuleHrefs.includes(item.href) ? "Retirer des favoris" : "Ajouter aux favoris"}
                        aria-label={favoriteModuleHrefs.includes(item.href) ? "Retirer des favoris" : "Ajouter aux favoris"}
                        aria-pressed={favoriteModuleHrefs.includes(item.href)}
                        onClick={() => toggleFavoriteModule(item.href)}
                      >
                        <Star size={14} fill={favoriteModuleHrefs.includes(item.href) ? "currentColor" : "none"} aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                )}
              </div>
            ))}
          </nav>
        </aside>

        <div className="lonaci-db-main">
          <header className="lonaci-db-header">
            <button
              ref={mobileMenuButtonRef}
              type="button"
              className="lonaci-db-mobile-menu-btn"
              aria-label="Ouvrir le menu"
              aria-controls="lonaci-mobile-drawer"
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen(true)}
            >
              <Menu size={18} aria-hidden="true" />
            </button>
            <div className="lonaci-db-header-grow">
              <div className="lonaci-db-header-title">{title}</div>
              <div className="lonaci-db-header-sub" suppressHydrationWarning>
                {sub}
              </div>
            </div>
            <ShellAgenceFilterDropdown
              value={agenceKey}
              onChange={(nextAgenceId) => {
                setAgenceKey(nextAgenceId);
                void refreshKpi(nextAgenceId);
              }}
            />
            <NotificationBell
              triggerClassName="lonaci-db-notif-btn"
              triggerContent={<Bell size={17} aria-hidden="true" />}
            />
            <div className="lonaci-db-header-user-menu-wrap" ref={userMenuRef}>
              <div className="lonaci-db-header-user">
                <div className="lonaci-db-header-user-meta">
                  <div className="lonaci-db-header-user-name">
                    {(meUser?.prenom ? `${meUser.prenom} ` : "") + (meUser?.nom ?? "") || "—"}
                  </div>
                  <div className="lonaci-db-header-user-role">{roleLabel || "—"}</div>
                </div>

                <button
                  ref={userMenuButtonRef}
                  type="button"
                  className="lonaci-db-avatar-btn"
                  aria-haspopup="menu"
                  aria-label="Menu utilisateur"
                  aria-expanded={userMenuOpen}
                  aria-controls="lonaci-user-menu"
                  onClick={() => setUserMenuOpen((v) => !v)}
                  disabled={loggingOut}
                >
                  <div className="lonaci-db-header-avatar">{initials}</div>
                </button>
              </div>

              {userMenuOpen ? (
                <div id="lonaci-user-menu" className="lonaci-db-user-menu" role="menu" aria-label="Menu utilisateur">
                  <div className="lonaci-db-user-menu-head">Utilisateur</div>
                  <button
                    type="button"
                    className="lonaci-db-user-menu-item"
                    role="menuitem"
                    onClick={() => {
                      setUserMenuOpen(false);
                      router.push("/parametres");
                    }}
                  >
                    <UserRound size={16} aria-hidden="true" />
                    Mon compte
                  </button>
                  {meUser?.role === "CHEF_SERVICE" ? (
                    <button
                      type="button"
                      className="lonaci-db-user-menu-item"
                      role="menuitem"
                      onClick={() => {
                        setUserMenuOpen(false);
                        router.push("/parametres?createUser=1");
                      }}
                    >
                      <UserRoundPlus size={16} aria-hidden="true" />
                      Créer un utilisateur
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="lonaci-db-user-menu-item lonaci-db-user-menu-item-danger"
                    role="menuitem"
                    onClick={() => void handleLogout()}
                    disabled={loggingOut}
                  >
                    <LogOut size={16} aria-hidden="true" />
                    {loggingOut ? "Déconnexion..." : "Déconnexion"}
                  </button>
                </div>
              ) : null}
            </div>
          </header>

          <main className="lonaci-db-content">
            <div className="lonaci-shell-page-inner">{children}</div>
          </main>
        </div>
      </div>

      <div
        className={
          mobileMenuOpen
            ? "lonaci-db-mobile-overlay lonaci-db-mobile-overlay-open"
            : "lonaci-db-mobile-overlay"
        }
        aria-hidden={!mobileMenuOpen}
        inert={!mobileMenuOpen ? true : undefined}
      >
        <button
          type="button"
          className="lonaci-db-mobile-backdrop"
          aria-label="Fermer le menu"
          onClick={() => setMobileMenuOpen(false)}
        />
        <aside
          id="lonaci-mobile-drawer"
          ref={mobileDrawerRef}
          role="dialog"
          aria-modal={mobileMenuOpen ? "true" : undefined}
          aria-label="Navigation principale"
          tabIndex={-1}
          className={
            mobileMenuOpen
              ? "lonaci-db-mobile-drawer lonaci-db-mobile-drawer-open"
              : "lonaci-db-mobile-drawer"
          }
        >
          <div className="lonaci-db-mobile-drawer-head">
            <div className="lonaci-db-sidebar-brand-inner">
              <LonaciBrand inverse />
            </div>
            <button
              type="button"
              className="lonaci-db-mobile-close-btn"
              aria-label="Fermer le menu"
              onClick={() => setMobileMenuOpen(false)}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          <nav className="lonaci-db-mobile-nav">
            <div className="lonaci-db-nav-search">
              <Search size={15} aria-hidden="true" />
              <input
                value={navQuery}
                onChange={(e) => setNavQuery(e.target.value)}
                placeholder="Rechercher un module..."
                aria-label="Rechercher un module"
              />
            </div>
            {filteredNavItems.map(({ item, showSection, active, badgeCount }) => (
              <div key={`mobile-${item.href}-${item.label}`}>
                {showSection ? <div className="lonaci-db-nav-section">{item.section}</div> : null}
                {item.disabled ? (
                  <span className="lonaci-db-nav-item lonaci-db-nav-item-disabled">
                    <LonaciNavIcon icon={item.icon} color={item.iconColor} />
                    <span>{item.label}</span>
                  </span>
                ) : (
                  <div className="lonaci-db-nav-row">
                    <Link
                      href={item.href}
                      className={active ? "lonaci-db-nav-item lonaci-db-active" : "lonaci-db-nav-item"}
                      aria-current={active ? "page" : undefined}
                      onClick={() => {
                        rememberRecentModule(item.href);
                        setMobileMenuOpen(false);
                      }}
                    >
                      <LonaciNavIcon icon={item.icon} color={item.iconColor} />
                      <span>{item.label}</span>
                      {badgeCount && badgeCount > 0 && item.badge ? (
                        <span className={`lonaci-db-nav-badge ${lonaciNavBadgeClass(item.badge)}`}>{badgeCount}</span>
                      ) : null}
                    </Link>
                    <button
                      type="button"
                      className="lonaci-db-nav-favorite"
                      title={favoriteModuleHrefs.includes(item.href) ? "Retirer des favoris" : "Ajouter aux favoris"}
                      aria-label={favoriteModuleHrefs.includes(item.href) ? "Retirer des favoris" : "Ajouter aux favoris"}
                      aria-pressed={favoriteModuleHrefs.includes(item.href)}
                      onClick={() => toggleFavoriteModule(item.href)}
                    >
                      <Star size={14} fill={favoriteModuleHrefs.includes(item.href) ? "currentColor" : "none"} aria-hidden="true" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </nav>
        </aside>
      </div>
    </div>
  );
}

export default function LonaciShell({ children }: { children: ReactNode }) {
  return (
    <LonaciKpiProvider>
      <LonaciShellChrome>{children}</LonaciShellChrome>
    </LonaciKpiProvider>
  );
}
