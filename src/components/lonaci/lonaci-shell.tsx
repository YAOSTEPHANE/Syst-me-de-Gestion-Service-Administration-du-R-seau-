"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  Bell,
  GripVertical,
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
  type DragEvent,
  type ReactNode,
} from "react";
import { toast } from "sonner";

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
import {
  getDefaultMenuOrder,
  mergeMenuOrder,
  toMenuOrder,
  type MenuOrderSection,
  type ResolvedNavCatalogItem,
} from "@/lib/lonaci/nav-catalog";

const SIDEBAR_STORAGE_KEY = "lonaci-sidebar-collapsed";
const SIDEBAR_STORE_EVENT = "lonaci:sidebar-collapsed";
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

type MenuDropEdge = "before" | "after";

function cloneMenuOrder(order: readonly MenuOrderSection[]): MenuOrderSection[] {
  return order.map((section) => ({
    section: section.section,
    hrefs: [...section.hrefs],
  }));
}

function parseMenuOrderResponse(value: unknown): MenuOrderSection[] | null {
  if (typeof value !== "object" || value === null || !("order" in value)) {
    return null;
  }
  const order = value.order;
  if (!Array.isArray(order)) return null;
  const parsed: MenuOrderSection[] = [];
  for (const entry of order) {
    const hrefs: unknown =
      typeof entry === "object" && entry !== null && "hrefs" in entry
        ? entry.hrefs
        : null;
    if (
      typeof entry !== "object" ||
      entry === null ||
      !("section" in entry) ||
      typeof entry.section !== "string" ||
      !Array.isArray(hrefs) ||
      !hrefs.every((href: unknown): href is string => typeof href === "string")
    ) {
      return null;
    }
    parsed.push({ section: entry.section, hrefs: [...hrefs] });
  }
  return parsed;
}

function parseApiErrorMessage(value: unknown): string | null {
  if (
    typeof value === "object" &&
    value !== null &&
    "message" in value &&
    typeof value.message === "string"
  ) {
    return value.message;
  }
  return null;
}

function focusFirstVisible(selector: string): void {
  const element = Array.from(
    document.querySelectorAll<HTMLButtonElement>(selector),
  ).find((candidate) => candidate.getClientRects().length > 0 && !candidate.disabled);
  element?.focus();
}

function MenuOrderControls({
  item,
  busy,
  grabbed,
  canMoveUp,
  canMoveDown,
  onMove,
  onDragStart,
  onDragEnd,
}: {
  item: ResolvedNavCatalogItem<LonaciNavItem>;
  busy: boolean;
  grabbed: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (href: string, direction: -1 | 1) => void;
  onDragStart: (event: DragEvent<HTMLButtonElement>, item: ResolvedNavCatalogItem<LonaciNavItem>) => void;
  onDragEnd: () => void;
}) {
  return (
    <div className="lonaci-db-nav-order-controls" aria-label={`Position de ${item.label}`}>
      <button
        type="button"
        className="lonaci-db-nav-drag-handle"
        data-menu-order-control={item.href}
        draggable={!busy}
        aria-grabbed={grabbed}
        aria-describedby="lonaci-menu-order-instructions"
        aria-label={`Déplacer ${item.label} par glisser-déposer dans la section ${item.resolvedSection}`}
        title="Glisser pour déplacer dans cette section"
        disabled={busy}
        onDragStart={(event) => onDragStart(event, item)}
        onDragEnd={onDragEnd}
      >
        <GripVertical size={18} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="lonaci-db-nav-order-button"
        data-menu-order-control={item.href}
        aria-label={`Monter ${item.label}`}
        title="Monter"
        disabled={busy || !canMoveUp}
        onClick={() => onMove(item.href, -1)}
      >
        <ArrowUp size={16} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="lonaci-db-nav-order-button"
        data-menu-order-control={item.href}
        aria-label={`Descendre ${item.label}`}
        title="Descendre"
        disabled={busy || !canMoveDown}
        onClick={() => onMove(item.href, 1)}
      >
        <ArrowDown size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

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
  const [favoriteModuleHrefs, setFavoriteModuleHrefs] = useState<string[]>([]);
  const [savedMenuOrder, setSavedMenuOrder] = useState<MenuOrderSection[]>(() =>
    getDefaultMenuOrder(LONACI_NAV),
  );
  const [draftMenuOrder, setDraftMenuOrder] = useState<MenuOrderSection[]>(() =>
    getDefaultMenuOrder(LONACI_NAV),
  );
  const [menuOrderLoading, setMenuOrderLoading] = useState(true);
  const [editingMenuOrder, setEditingMenuOrder] = useState(false);
  const [savingMenuOrder, setSavingMenuOrder] = useState(false);
  const [draggedMenuHref, setDraggedMenuHref] = useState<string | null>(null);
  const [menuDropTarget, setMenuDropTarget] = useState<{
    href: string;
    edge: MenuDropEdge;
  } | null>(null);
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
    if (!meUser?.role) return;
    const controller = new AbortController();
    setMenuOrderLoading(true);
    void (async () => {
      try {
        const response = await fetch("/api/menu-order", {
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Ordre du menu indisponible");
        const parsed = parseMenuOrderResponse(await response.json());
        if (!parsed) throw new Error("Réponse d'ordre du menu invalide");
        const canonical = toMenuOrder(mergeMenuOrder(LONACI_NAV, parsed));
        setSavedMenuOrder(canonical);
        setDraftMenuOrder(cloneMenuOrder(canonical));
      } catch (error) {
        if (controller.signal.aborted) return;
        toast.error(
          error instanceof Error
            ? error.message
            : "Impossible de charger l'ordre global du menu.",
        );
      } finally {
        if (!controller.signal.aborted) setMenuOrderLoading(false);
      }
    })();
    return () => controller.abort();
  }, [meUser?.role]);

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

  const orderedNavigation = useMemo(
    () =>
      mergeMenuOrder(
        LONACI_NAV,
        editingMenuOrder ? draftMenuOrder : savedMenuOrder,
      ),
    [draftMenuOrder, editingMenuOrder, savedMenuOrder],
  );

  const navItems = useMemo(() => {
    const roleRaw = meUser?.role ?? "";
    const role = LONACI_ROLES.includes(roleRaw as LonaciRole) ? (roleRaw as LonaciRole) : null;
    const visibleNav = orderedNavigation.filter((item) => {
      if (role === "DISPATCHER") {
        return item.href === "/dispatcher" || item.href === "/parametres";
      }
      if (item.href === "/dispatcher") return false;
      const rule = NAV_RBAC_RULES[item.href];
      if (!rule || !role) return true;
      return canRole({ role, resource: rule.resource, action: rule.action }).allowed;
    });
    return visibleNav.map((item) => {
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
  }, [pathname, kpi, meUser?.role, orderedNavigation]);

  const filteredNavItems = useMemo(() => {
    const query = navQuery.trim().toLowerCase();
    const base =
      query.length === 0
        ? navItems
        : navItems.filter(({ item }) => {
            const inLabel = item.label.toLowerCase().includes(query);
            const inSection = item.resolvedSection.toLowerCase().includes(query);
            return inLabel || inSection;
          });

    let last = "";
    return base.map((entry) => {
      const showSection = entry.item.resolvedSection !== last;
      last = entry.item.resolvedSection;
      return { ...entry, showSection };
    });
  }, [navItems, navQuery]);

  const favoriteModules = useMemo(
    () =>
      favoriteModuleHrefs
        .map((href) => navItems.find((entry) => entry.item.href === href))
        .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)),
    [navItems, favoriteModuleHrefs],
  );

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

  const beginMenuOrderEdit = useCallback(() => {
    if (
      meUser?.role !== "CHEF_SERVICE" ||
      menuOrderLoading ||
      savingMenuOrder
    ) return;
    setNavQuery("");
    setSidebarCollapsed(false);
    setDraftMenuOrder(cloneMenuOrder(savedMenuOrder));
    setEditingMenuOrder(true);
    window.requestAnimationFrame(() => {
      focusFirstVisible("[data-menu-order-control]");
    });
  }, [
    meUser?.role,
    menuOrderLoading,
    savedMenuOrder,
    savingMenuOrder,
    setSidebarCollapsed,
  ]);

  const cancelMenuOrderEdit = useCallback(() => {
    if (savingMenuOrder) return;
    setDraftMenuOrder(cloneMenuOrder(savedMenuOrder));
    setEditingMenuOrder(false);
    setDraggedMenuHref(null);
    setMenuDropTarget(null);
    window.requestAnimationFrame(() =>
      focusFirstVisible("[data-menu-order-start]"),
    );
  }, [savedMenuOrder, savingMenuOrder]);

  const canMoveMenuItem = useCallback(
    (href: string, direction: -1 | 1) => {
      const section = draftMenuOrder.find((entry) => entry.hrefs.includes(href));
      if (!section) return false;
      const index = section.hrefs.indexOf(href);
      return direction === -1 ? index > 0 : index < section.hrefs.length - 1;
    },
    [draftMenuOrder],
  );

  const moveMenuItem = useCallback((href: string, direction: -1 | 1) => {
    setDraftMenuOrder((current) =>
      current.map((section) => {
        const index = section.hrefs.indexOf(href);
        const nextIndex = index + direction;
        if (index < 0 || nextIndex < 0 || nextIndex >= section.hrefs.length) {
          return section;
        }
        const hrefs = [...section.hrefs];
        [hrefs[index], hrefs[nextIndex]] = [hrefs[nextIndex], hrefs[index]];
        return { ...section, hrefs };
      }),
    );
  }, []);

  const reorderDraggedMenuItem = useCallback(
    (sourceHref: string, targetHref: string, edge: MenuDropEdge) => {
      if (sourceHref === targetHref) return;
      setDraftMenuOrder((current) =>
        current.map((section) => {
          if (
            !section.hrefs.includes(sourceHref) ||
            !section.hrefs.includes(targetHref)
          ) {
            return section;
          }
          const hrefs = section.hrefs.filter((href) => href !== sourceHref);
          const targetIndex = hrefs.indexOf(targetHref);
          hrefs.splice(targetIndex + (edge === "after" ? 1 : 0), 0, sourceHref);
          return { ...section, hrefs };
        }),
      );
    },
    [],
  );

  const handleMenuDragStart = useCallback(
    (
      event: DragEvent<HTMLButtonElement>,
      item: ResolvedNavCatalogItem<LonaciNavItem>,
    ) => {
      if (!editingMenuOrder || savingMenuOrder) {
        event.preventDefault();
        return;
      }
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", item.href);
      setDraggedMenuHref(item.href);
    },
    [editingMenuOrder, savingMenuOrder],
  );

  const handleMenuDragOver = useCallback(
    (
      event: DragEvent<HTMLDivElement>,
      target: ResolvedNavCatalogItem<LonaciNavItem>,
    ) => {
      if (!draggedMenuHref) return;
      const sourceSection = draftMenuOrder.find((section) =>
        section.hrefs.includes(draggedMenuHref),
      );
      if (
        !sourceSection ||
        sourceSection.section !== target.resolvedSection
      ) {
        event.dataTransfer.dropEffect = "none";
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      const bounds = event.currentTarget.getBoundingClientRect();
      const edge: MenuDropEdge =
        event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
      setMenuDropTarget({ href: target.href, edge });
    },
    [draftMenuOrder, draggedMenuHref],
  );

  const handleMenuDrop = useCallback(
    (
      event: DragEvent<HTMLDivElement>,
      target: ResolvedNavCatalogItem<LonaciNavItem>,
    ) => {
      if (!draggedMenuHref) return;
      const sourceSection = draftMenuOrder.find((section) =>
        section.hrefs.includes(draggedMenuHref),
      );
      if (
        !sourceSection ||
        sourceSection.section !== target.resolvedSection
      ) {
        return;
      }
      event.preventDefault();
      reorderDraggedMenuItem(
        draggedMenuHref,
        target.href,
        menuDropTarget?.href === target.href ? menuDropTarget.edge : "before",
      );
      setDraggedMenuHref(null);
      setMenuDropTarget(null);
    },
    [
      draftMenuOrder,
      draggedMenuHref,
      menuDropTarget,
      reorderDraggedMenuItem,
    ],
  );

  const endMenuDrag = useCallback(() => {
    setDraggedMenuHref(null);
    setMenuDropTarget(null);
  }, []);

  const saveMenuOrder = useCallback(async () => {
    if (meUser?.role !== "CHEF_SERVICE" || savingMenuOrder) return;
    const previous = cloneMenuOrder(savedMenuOrder);
    const optimistic = toMenuOrder(mergeMenuOrder(LONACI_NAV, draftMenuOrder));
    const toastId = toast.loading("Enregistrement de l'ordre global du menu…");
    setSavingMenuOrder(true);
    setSavedMenuOrder(optimistic);
    setDraftMenuOrder(cloneMenuOrder(optimistic));
    try {
      const response = await fetch("/api/menu-order", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: optimistic }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          parseApiErrorMessage(body) ??
            "Impossible d'enregistrer l'ordre global du menu.",
        );
      }
      const canonical = parseMenuOrderResponse(body);
      if (!canonical) throw new Error("Réponse de sauvegarde invalide.");
      const merged = toMenuOrder(mergeMenuOrder(LONACI_NAV, canonical));
      setSavedMenuOrder(merged);
      setDraftMenuOrder(cloneMenuOrder(merged));
      setEditingMenuOrder(false);
      toast.success("Ordre global du menu enregistré.", { id: toastId });
    } catch (error) {
      setSavedMenuOrder(previous);
      setDraftMenuOrder(cloneMenuOrder(optimistic));
      setEditingMenuOrder(true);
      toast.error(
        error instanceof Error
          ? error.message
          : "Impossible d'enregistrer l'ordre global du menu.",
        { id: toastId },
      );
    } finally {
      setSavingMenuOrder(false);
      setDraggedMenuHref(null);
      setMenuDropTarget(null);
    }
  }, [draftMenuOrder, meUser?.role, savedMenuOrder, savingMenuOrder]);

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
                  disabled={editingMenuOrder || savingMenuOrder}
                />
              </div>
            ) : null}
            {!sidebarCollapsed && meUser?.role === "CHEF_SERVICE" ? (
              <div className="lonaci-db-nav-order-toolbar">
                {editingMenuOrder ? (
                  <>
                    <p id="lonaci-menu-order-instructions" className="lonaci-db-nav-order-instructions">
                      Glissez la poignée sur ordinateur, ou utilisez Monter et Descendre. Un module reste dans sa section.
                    </p>
                    <div className="lonaci-db-nav-order-actions">
                      <button
                        type="button"
                        className="lonaci-db-nav-order-cancel"
                        disabled={savingMenuOrder}
                        onClick={cancelMenuOrderEdit}
                      >
                        Annuler
                      </button>
                      <button
                        type="button"
                        className="lonaci-db-nav-order-save"
                        disabled={savingMenuOrder}
                        aria-busy={savingMenuOrder}
                        onClick={() => void saveMenuOrder()}
                      >
                        {savingMenuOrder ? "Enregistrement…" : "Enregistrer"}
                      </button>
                    </div>
                  </>
                ) : (
                  <button
                    type="button"
                    className="lonaci-db-nav-order-start"
                    data-menu-order-start
                    disabled={menuOrderLoading || savingMenuOrder}
                    onClick={beginMenuOrderEdit}
                  >
                    <GripVertical size={16} aria-hidden="true" />
                    {menuOrderLoading ? "Chargement de l'ordre…" : "Réorganiser le menu"}
                  </button>
                )}
                <span className="lonaci-db-sr-only" aria-live="polite">
                  {savingMenuOrder ? "Enregistrement de l'ordre du menu en cours." : ""}
                </span>
              </div>
            ) : null}
            {!sidebarCollapsed && !editingMenuOrder && favoriteModules.length > 0 ? (
              <div className="lonaci-db-nav-shortcuts">
                <div className="lonaci-db-nav-shortcuts-title">Favoris</div>
                <div className="lonaci-db-nav-shortcuts-list">
                  {favoriteModules.slice(0, 6).map(({ item }) => (
                    <Link
                      key={`favorite-${item.href}`}
                      href={item.href}
                      className="lonaci-db-nav-shortcut lonaci-db-nav-shortcut--favorite"
                    >
                      ★ {item.label}
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
            {filteredNavItems.map(({ item, showSection, active, badgeCount }) => (
              <div
                key={`${item.href}-${item.label}`}
                className={[
                  "lonaci-db-nav-order-entry",
                  draggedMenuHref === item.href ? "lonaci-db-nav-order-entry--dragging" : "",
                  menuDropTarget?.href === item.href
                    ? `lonaci-db-nav-order-entry--drop-${menuDropTarget.edge}`
                    : "",
                ].filter(Boolean).join(" ")}
                onDragOver={editingMenuOrder ? (event) => handleMenuDragOver(event, item) : undefined}
                onDrop={editingMenuOrder ? (event) => handleMenuDrop(event, item) : undefined}
              >
                {!sidebarCollapsed && showSection ? <div className="lonaci-db-nav-section">{item.resolvedSection}</div> : null}
                {item.disabled && !editingMenuOrder ? (
                  <span className="lonaci-db-nav-item lonaci-db-nav-item-disabled" title={sidebarCollapsed ? item.label : undefined}>
                    <LonaciNavIcon icon={item.icon} color={item.iconColor} />
                    <span className="lonaci-db-nav-label">{item.label}</span>
                  </span>
                ) : editingMenuOrder ? (
                  <div className="lonaci-db-nav-row lonaci-db-nav-row--ordering">
                    <span
                      className="lonaci-db-nav-item lonaci-db-nav-item-editing"
                      aria-label={`${item.label}, section ${item.resolvedSection}`}
                    >
                      <LonaciNavIcon icon={item.icon} color={item.iconColor} />
                      <span className="lonaci-db-nav-label">{item.label}</span>
                    </span>
                    <MenuOrderControls
                      item={item}
                      busy={savingMenuOrder}
                      grabbed={draggedMenuHref === item.href}
                      canMoveUp={canMoveMenuItem(item.href, -1)}
                      canMoveDown={canMoveMenuItem(item.href, 1)}
                      onMove={moveMenuItem}
                      onDragStart={handleMenuDragStart}
                      onDragEnd={endMenuDrag}
                    />
                  </div>
                ) : (
                  <div className="lonaci-db-nav-row">
                    <Link
                      href={item.href}
                      className={active ? "lonaci-db-nav-item lonaci-db-active" : "lonaci-db-nav-item"}
                      title={sidebarCollapsed ? item.label : undefined}
                      aria-current={active ? "page" : undefined}
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
                disabled={editingMenuOrder || savingMenuOrder}
              />
            </div>
            {meUser?.role === "CHEF_SERVICE" ? (
              <div className="lonaci-db-nav-order-toolbar">
                {editingMenuOrder ? (
                  <>
                    <p className="lonaci-db-nav-order-instructions">
                      Utilisez Monter et Descendre. Chaque module reste dans sa section.
                    </p>
                    <div className="lonaci-db-nav-order-actions">
                      <button
                        type="button"
                        className="lonaci-db-nav-order-cancel"
                        disabled={savingMenuOrder}
                        onClick={cancelMenuOrderEdit}
                      >
                        Annuler
                      </button>
                      <button
                        type="button"
                        className="lonaci-db-nav-order-save"
                        disabled={savingMenuOrder}
                        aria-busy={savingMenuOrder}
                        onClick={() => void saveMenuOrder()}
                      >
                        {savingMenuOrder ? "Enregistrement…" : "Enregistrer"}
                      </button>
                    </div>
                  </>
                ) : (
                  <button
                    type="button"
                    className="lonaci-db-nav-order-start"
                    data-menu-order-start
                    disabled={menuOrderLoading || savingMenuOrder}
                    onClick={beginMenuOrderEdit}
                  >
                    <GripVertical size={16} aria-hidden="true" />
                    {menuOrderLoading ? "Chargement de l'ordre…" : "Réorganiser le menu"}
                  </button>
                )}
              </div>
            ) : null}
            {filteredNavItems.map(({ item, showSection, active, badgeCount }) => (
              <div
                key={`mobile-${item.href}-${item.label}`}
                className="lonaci-db-nav-order-entry"
              >
                {showSection ? <div className="lonaci-db-nav-section">{item.resolvedSection}</div> : null}
                {item.disabled && !editingMenuOrder ? (
                  <span className="lonaci-db-nav-item lonaci-db-nav-item-disabled">
                    <LonaciNavIcon icon={item.icon} color={item.iconColor} />
                    <span>{item.label}</span>
                  </span>
                ) : editingMenuOrder ? (
                  <div className="lonaci-db-nav-row lonaci-db-nav-row--ordering">
                    <span
                      className="lonaci-db-nav-item lonaci-db-nav-item-editing"
                      aria-label={`${item.label}, section ${item.resolvedSection}`}
                    >
                      <LonaciNavIcon icon={item.icon} color={item.iconColor} />
                      <span>{item.label}</span>
                    </span>
                    <MenuOrderControls
                      item={item}
                      busy={savingMenuOrder}
                      grabbed={draggedMenuHref === item.href}
                      canMoveUp={canMoveMenuItem(item.href, -1)}
                      canMoveDown={canMoveMenuItem(item.href, 1)}
                      onMove={moveMenuItem}
                      onDragStart={handleMenuDragStart}
                      onDragEnd={endMenuDrag}
                    />
                  </div>
                ) : (
                  <div className="lonaci-db-nav-row">
                    <Link
                      href={item.href}
                      className={active ? "lonaci-db-nav-item lonaci-db-active" : "lonaci-db-nav-item"}
                      aria-current={active ? "page" : undefined}
                      onClick={() => setMobileMenuOpen(false)}
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
