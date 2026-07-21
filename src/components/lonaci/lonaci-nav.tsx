import {
  AlertTriangle,
  BadgeCheck,
  Banknote,
  BookOpenText,
  Bot,
  Building2,
  FileBarChart,
  FileCheck2,
  FileInput,
  FileSignature,
  FolderKanban,
  Gauge,
  HandCoins,
  HeartHandshake,
  Import,
  Map,
  MapPinned,
  ReceiptText,
  ScanLine,
  ScrollText,
  Settings,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";

import {
  LONACI_NAV_CATALOG,
  type KnownNavHref,
} from "@/lib/lonaci/nav-catalog";

export type LonaciNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  iconColor: string;
  section?: string;
  badge?: "dossiers" | "cautions" | "succession" | "pdv" | "agrements" | "bancarisation";
  disabled?: boolean;
};

type LonaciNavVisual = Pick<LonaciNavItem, "icon" | "iconColor" | "badge" | "disabled">;

const LONACI_NAV_VISUALS: Record<KnownNavHref, LonaciNavVisual> = {
  "/dashboard": { icon: Gauge, iconColor: "#38bdf8" },
  "/clients": { icon: Users, iconColor: "#22d3ee" },
  "/dossiers": { icon: FolderKanban, iconColor: "#f472b6", badge: "dossiers" },
  "/cautions": { icon: HandCoins, iconColor: "#fbbf24", badge: "cautions" },
  "/concessionnaires": { icon: Building2, iconColor: "#fb923c" },
  "/contrats": { icon: FileSignature, iconColor: "#818cf8" },
  "/agrements": { icon: BadgeCheck, iconColor: "#34d399", badge: "agrements" },
  "/pdv-integrations": { icon: MapPinned, iconColor: "#2dd4bf", badge: "pdv" },
  "/attestations-domiciliation": { icon: FileCheck2, iconColor: "#4ade80" },
  "/bancarisation": { icon: Banknote, iconColor: "#86efac", badge: "bancarisation" },
  "/cessions": { icon: FileInput, iconColor: "#c084fc" },
  "/resiliations": { icon: ReceiptText, iconColor: "#fb7185" },
  "/succession": { icon: HeartHandshake, iconColor: "#f9a8d4", badge: "succession" },
  "/gpr": { icon: Sparkles, iconColor: "#fde047" },
  "/contrats-grattage": { icon: ScrollText, iconColor: "#fdba74" },
  "/dispatcher": { icon: ScanLine, iconColor: "#67e8f9" },
  "/registres": { icon: BookOpenText, iconColor: "#93c5fd" },
  "/carte-pdv": { icon: Map, iconColor: "#5eead4" },
  "/rapports": { icon: FileBarChart, iconColor: "#a5b4fc" },
  "/alertes": { icon: AlertTriangle, iconColor: "#f87171" },
  "/assistant-operations": { icon: Bot, iconColor: "#d8b4fe" },
  "/import": { icon: Import, iconColor: "#a78bfa" },
  "/parametres": { icon: Settings, iconColor: "#cbd5e1" },
};

export const LONACI_NAV: LonaciNavItem[] = LONACI_NAV_CATALOG.map((item) => ({
  ...item,
  ...LONACI_NAV_VISUALS[item.href],
}));

export const LONACI_AGENCES = [
  { value: "", label: "Toutes les agences" },
  { value: "yop1", label: "Yopougon 1" },
  { value: "abobo", label: "Abobo" },
  { value: "plateau", label: "Plateau" },
  { value: "cocody", label: "Cocody" },
  { value: "marcory", label: "Marcory" },
] as const;

export function lonaciNavBadgeClass(kind: NonNullable<LonaciNavItem["badge"]>): string {
  void kind;
  return "lonaci-db-nav-badge-orange";
}

export function isLonaciNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function LonaciNavIcon({ icon: Icon, color }: { icon: LucideIcon; color?: string }) {
  return <Icon size={17} strokeWidth={1.8} style={{ color }} aria-hidden="true" />;
}
