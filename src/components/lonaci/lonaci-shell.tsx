"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { LonaciKpiProvider, useLonaciKpi } from "@/components/lonaci/lonaci-kpi-context";
import {
  LONACI_AGENCES,
  LONACI_NAV,
  LonaciNavIcon,
  lonaciNavBadgeClass,
  type LonaciNavItem,
} from "@/components/lonaci/lonaci-nav";
import NotificationBell from "@/components/lonaci/notification-bell";
import { lonaciShellHeader } from "@/lib/lonaci/lonaci-shell-header";
import { getLonaciRoleLabel } from "@/lib/lonaci/constants";

function LonaciShellChrome({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { kpi } = useLonaciKpi();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [agenceKey, setAgenceKey] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const [meUser, setMeUser] = useState<{ role: string; prenom: string; nom: string } | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
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
        const data = (await res.json()) as { user: { role: string; prenom: string; nom: string } };
        setMeUser({
          role: data.user.role,
          prenom: data.user.prenom ?? "",
          nom: data.user.nom ?? "",
        });
      } catch {
        setMeUser({ role: "", prenom: "", nom: "" });
      }
    })();
  }, []);

  const { title, sub } = lonaciShellHeader(pathname ?? "/", kpi, agenceKey);

  const navItems = useMemo(() => {
    let last = "";
    return LONACI_NAV.map((item: LonaciNavItem) => {
      const showSection = Boolean(item.section && item.section !== last);
      if (item.section) last = item.section;
      const active = !item.disabled && pathname === item.href;
      let badgeCount: number | null = null;
      if (kpi && item.badge === "contracts") badgeCount = kpi.dossierValidation.contratSoumis;
      if (kpi && item.badge === "cautions") badgeCount = kpi.daily.cautions.enAttente;
      if (kpi && item.badge === "succession") badgeCount = kpi.dossierValidation.successionOuverts;
      if (kpi && item.badge === "pdv") badgeCount = kpi.dossierValidation.pdvNonFinalise;
      if (kpi && item.badge === "agrements") badgeCount = kpi.dossierValidation.agrementsEnAttente;
      if (kpi && item.badge === "bancarisation") badgeCount = kpi.bancarisation.enCours + kpi.bancarisation.nonBancarise;
      return { item, showSection, active, badgeCount };
    });
  }, [pathname, kpi]);

  async function handleLogout() {
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
  }

  useEffect(() => {
    if (!userMenuOpen) return;

    const onMouseDown = (event: MouseEvent) => {
      const el = userMenuRef.current;
      if (!el) return;
      const target = event.target as Node;
      if (el.contains(target)) return;
      setUserMenuOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setUserMenuOpen(false);
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
    <div className="lonaci-db-app">
      <div className="lonaci-db-layout">
        <aside className="lonaci-db-sidebar">
          <div className="lonaci-db-sidebar-brand">
            <div className="lonaci-db-sidebar-brand-inner">
              <div className="lonaci-db-logo">SG</div>
              <div>
                <div className="lonaci-db-logo-title">Système de Gestion</div>
              </div>
            </div>
          </div>

          <nav className="lonaci-db-nav">
            {navItems.map(({ item, showSection, active, badgeCount }) => (
              <div key={`${item.href}-${item.label}`}>
                {showSection ? <div className="lonaci-db-nav-section">{item.section}</div> : null}
                {item.disabled ? (
                  <span className="lonaci-db-nav-item lonaci-db-nav-item-disabled">
                    <LonaciNavIcon label={item.label} />
                    <span>{item.label}</span>
                  </span>
                ) : (
                  <Link href={item.href} className={`lonaci-db-nav-item ${active ? "lonaci-db-active" : ""}`}>
                    <LonaciNavIcon label={item.label} />
                    <span>{item.label}</span>
                    {active && item.href === "/dashboard" ? <span className="lonaci-db-nav-active-dot" /> : null}
                    {badgeCount && badgeCount > 0 && item.badge ? (
                      <span className={`lonaci-db-nav-badge ${lonaciNavBadgeClass(item.badge)}`}>{badgeCount}</span>
                    ) : null}
                  </Link>
                )}
              </div>
            ))}
          </nav>
        </aside>

        <div className="lonaci-db-main">
          <header className="lonaci-db-header">
            <button
              type="button"
              className="lonaci-db-mobile-menu-btn"
              aria-label="Ouvrir le menu"
              onClick={() => setMobileMenuOpen(true)}
            >
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                <path d="M3 6h18M3 12h18M3 18h18" />
              </svg>
            </button>
            <div className="lonaci-db-header-grow">
              <div className="lonaci-db-header-title">{title}</div>
              <div className="lonaci-db-header-sub">{sub}</div>
            </div>
            <select
              className="lonaci-db-select"
              aria-label="Filtre agence"
              value={agenceKey}
              onChange={(e) => setAgenceKey(e.target.value)}
            >
              {LONACI_AGENCES.map((a) => (
                <option key={a.value || "all"} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
            <NotificationBell
              triggerClassName="lonaci-db-notif-btn"
              triggerContent={
                <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" />
                </svg>
              }
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
                  type="button"
                  className="lonaci-db-avatar-btn"
                  aria-haspopup="menu"
                  aria-label="Menu utilisateur"
                  onClick={() => setUserMenuOpen((v) => !v)}
                  disabled={loggingOut}
                >
                  <div className="lonaci-db-header-avatar">{initials}</div>
                </button>
              </div>

              {userMenuOpen ? (
                <div className="lonaci-db-user-menu" role="menu" aria-label="Menu utilisateur">
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

      <div className={`lonaci-db-mobile-overlay ${mobileMenuOpen ? "lonaci-db-mobile-overlay-open" : ""}`}>
        <button
          type="button"
          className="lonaci-db-mobile-backdrop"
          aria-label="Fermer le menu"
          onClick={() => setMobileMenuOpen(false)}
        />
        <aside className={`lonaci-db-mobile-drawer ${mobileMenuOpen ? "lonaci-db-mobile-drawer-open" : ""}`}>
          <div className="lonaci-db-mobile-drawer-head">
            <div className="lonaci-db-sidebar-brand-inner">
              <div className="lonaci-db-logo">SGAR</div>
              <div>
                <div className="lonaci-db-logo-title">Système de Gestion Service et Administration</div>
                <div className="lonaci-db-logo-sub">Réseau</div>
              </div>
            </div>
            <button
              type="button"
              className="lonaci-db-mobile-close-btn"
              aria-label="Fermer le menu"
              onClick={() => setMobileMenuOpen(false)}
            >
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <nav className="lonaci-db-mobile-nav">
            {navItems.map(({ item, showSection, active, badgeCount }) => (
              <div key={`mobile-${item.href}-${item.label}`}>
                {showSection ? <div className="lonaci-db-nav-section">{item.section}</div> : null}
                {item.disabled ? (
                  <span className="lonaci-db-nav-item lonaci-db-nav-item-disabled">
                    <LonaciNavIcon label={item.label} />
                    <span>{item.label}</span>
                  </span>
                ) : (
                  <Link href={item.href} className={`lonaci-db-nav-item ${active ? "lonaci-db-active" : ""}`}>
                    <LonaciNavIcon label={item.label} />
                    <span>{item.label}</span>
                    {badgeCount && badgeCount > 0 && item.badge ? (
                      <span className={`lonaci-db-nav-badge ${lonaciNavBadgeClass(item.badge)}`}>{badgeCount}</span>
                    ) : null}
                  </Link>
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
