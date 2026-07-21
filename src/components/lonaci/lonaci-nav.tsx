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

export type LonaciNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  iconColor: string;
  section?: string;
  badge?: "dossiers" | "cautions" | "succession" | "pdv" | "agrements" | "bancarisation";
  disabled?: boolean;
};

export const LONACI_NAV: LonaciNavItem[] = [
  { href: "/dashboard", label: "Tableau de bord", icon: Gauge, iconColor: "#38bdf8", section: "Principal" },
  { href: "/clients", label: "Clients", icon: Users, iconColor: "#22d3ee", section: "Parcours" },
  { href: "/dossiers", label: "Dossiers", icon: FolderKanban, iconColor: "#f472b6", badge: "dossiers" },
  { href: "/cautions", label: "Cautions", icon: HandCoins, iconColor: "#fbbf24", badge: "cautions" },
  { href: "/concessionnaires", label: "Concessionnaires", icon: Building2, iconColor: "#fb923c" },
  { href: "/contrats", label: "Contrats", icon: FileSignature, iconColor: "#818cf8" },
  { href: "/agrements", label: "Agréments", icon: BadgeCheck, iconColor: "#34d399", badge: "agrements" },
  { href: "/pdv-integrations", label: "Géolocalisation PDV", icon: MapPinned, iconColor: "#2dd4bf", badge: "pdv" },
  { href: "/attestations-domiciliation", label: "Attestations & domiciliation", icon: FileCheck2, iconColor: "#4ade80" },
  { href: "/bancarisation", label: "Bancarisation", icon: Banknote, iconColor: "#86efac", badge: "bancarisation" },
  { href: "/cessions", label: "Cessions & Déloc.", icon: FileInput, iconColor: "#c084fc", section: "Opérations" },
  { href: "/resiliations", label: "Résiliations", icon: ReceiptText, iconColor: "#fb7185" },
  { href: "/succession", label: "Décès et ayants droit", icon: HeartHandshake, iconColor: "#f9a8d4", badge: "succession" },
  { href: "/gpr", label: "Création de code grattage", icon: Sparkles, iconColor: "#fde047" },
  { href: "/contrats-grattage", label: "Contrats grattage", icon: ScrollText, iconColor: "#fdba74" },
  { href: "/dispatcher", label: "Dispatcher codes grattage", icon: ScanLine, iconColor: "#67e8f9", section: "Opérations" },
  { href: "/registres", label: "Registres", icon: BookOpenText, iconColor: "#93c5fd" },
  { href: "/carte-pdv", label: "Carte PDV", icon: Map, iconColor: "#5eead4", section: "Pilotage" },
  { href: "/rapports", label: "Rapports", icon: FileBarChart, iconColor: "#a5b4fc" },
  { href: "/alertes", label: "Toutes les alertes", icon: AlertTriangle, iconColor: "#f87171" },
  { href: "/assistant-operations", label: "Assistant opérations", icon: Bot, iconColor: "#d8b4fe" },
  { href: "/import", label: "Import", icon: Import, iconColor: "#a78bfa", section: "Administration" },
  { href: "/parametres", label: "Paramètres", icon: Settings, iconColor: "#cbd5e1" },
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
  void kind;
  return "lonaci-db-nav-badge-orange";
}

export function isLonaciNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function LonaciNavIcon({ icon: Icon, color }: { icon: LucideIcon; color?: string }) {
  return <Icon size={17} strokeWidth={1.8} style={{ color }} aria-hidden="true" />;
}
