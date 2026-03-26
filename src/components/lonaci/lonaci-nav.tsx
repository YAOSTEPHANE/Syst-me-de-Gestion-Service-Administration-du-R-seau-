export type LonaciNavItem = {
  href: string;
  label: string;
  section?: string;
  badge?: "contracts" | "cautions" | "succession" | "pdv" | "agrements" | "bancarisation";
  disabled?: boolean;
};

export const LONACI_NAV: LonaciNavItem[] = [
  { href: "/dashboard", label: "Tableau de bord", section: "Principal" },
  { href: "/import", label: "Import fichiers" },
  { href: "/concessionnaires", label: "Concessionnaires" },
  { href: "/contrats", label: "Contrats", badge: "contracts" },
  { href: "/cautions", label: "Cautions", badge: "cautions" },
  { href: "/pdv-integrations", label: "Intégrations PDV", badge: "pdv" },
  { href: "/agrements", label: "Agréments", badge: "agrements" },
  { href: "/attestations-domiciliation", label: "Attestations & domiciliation" },
  { href: "/cessions", label: "Cessions & Déloc.", section: "Opérations" },
  { href: "/resiliations", label: "Résiliations" },
  { href: "/succession", label: "Décès & Succession", badge: "succession" },
  { href: "/bancarisation", label: "Bancarisation", badge: "bancarisation" },
  { href: "/gpr", label: "GPR & Grattage" },
  { href: "/registres", label: "Registres" },
  { href: "/rapports", label: "Rapports", section: "Analyse" },
  { href: "/alertes", label: "Toutes les alertes" },
  { href: "/parametres", label: "Paramètres" },
  { href: "/carte-pdv", label: "Carte PDV" },
];

export const LONACI_AGENCES = [
  { value: "", label: "Toutes les agences" },
  { value: "yop1", label: "Yopougon 1" },
  { value: "abobo", label: "Abobo" },
  { value: "plateau", label: "Plateau" },
  { value: "cocody", label: "Cocody" },
  { value: "marcory", label: "Marcory" },
] as const;

export function lonaciNavBadgeClass(kind: NonNullable<LonaciNavItem["badge"]>): string {
  if (kind === "contracts") return "lonaci-db-nav-badge-blue";
  if (kind === "cautions") return "lonaci-db-nav-badge-amber";
  if (kind === "pdv") return "lonaci-db-nav-badge-violet";
  if (kind === "agrements") return "lonaci-db-nav-badge-indigo";
  if (kind === "bancarisation") return "lonaci-db-nav-badge-slate";
  return "lonaci-db-nav-badge-red";
}

export function LonaciNavIcon({ label }: { label: string }) {
  if (label === "Tableau de bord") {
    return (
      <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
      </svg>
    );
  }
  if (label === "Concessionnaires") {
    return (
      <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
      </svg>
    );
  }
  if (label.includes("Import")) {
    return (
      <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24">
        <path d="M12 3v12m0 0l-4-4m4 4l4-4" />
        <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
      </svg>
    );
  }
  if (label.includes("PDV")) {
    return (
      <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24">
        <path d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
        <circle cx="12" cy="11" r="3" />
      </svg>
    );
  }
  if (label === "Cautions") {
    return (
      <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24">
        <path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8V4m0 12v2M6 12H4m16 0h-2" />
      </svg>
    );
  }
  if (label === "Agréments") {
    return (
      <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24">
        <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    );
  }
  if (label.startsWith("Attestations")) {
    return (
      <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24">
        <path d="M9 12h6m-6 4h6M7 3h7l3 3v15a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z" />
      </svg>
    );
  }
  if (label.startsWith("Cessions")) {
    return (
      <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24">
        <path d="M8 7h12m0 0l-4-4m4 4l-4 4M4 17h12m0 0l-4-4m4 4l-4 4" />
      </svg>
    );
  }
  if (label === "Résiliations") {
    return (
      <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" />
        <path d="M15 9l-6 6M9 9l6 6" />
      </svg>
    );
  }
  if (label.includes("Succession")) {
    return (
      <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24">
        <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
      </svg>
    );
  }
  if (label === "Bancarisation") {
    return (
      <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24">
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <path d="M2 10h20" />
      </svg>
    );
  }
  if (label.startsWith("GPR")) {
    return (
      <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
      </svg>
    );
  }
  if (label === "Rapports") {
    return (
      <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    );
  }
  if (label === "Toutes les alertes") {
    return (
      <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24">
        <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" />
      </svg>
    );
  }
  if (label === "Paramètres") {
    return (
      <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.07 4.93a10 10 0 010 14.14M4.93 4.93a10 10 0 000 14.14" />
      </svg>
    );
  }
  return (
    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24">
      <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}
