import Link from "next/link";

import NotificationBell from "@/components/lonaci/notification-bell";

const links = [
  { href: "/", label: "Accueil" },
  { href: "/dashboard", label: "Tableau de bord" },
  { href: "/concessionnaires", label: "Concessionnaires" },
  { href: "/dossiers", label: "Dossiers" },
  { href: "/contrats", label: "Contrats" },
  { href: "/cautions", label: "Cautions" },
  { href: "/pdv-integrations", label: "PDV" },
  { href: "/carte-pdv", label: "Carte PDV" },
  { href: "/resiliations", label: "Résiliations" },
  { href: "/succession", label: "Décès" },
  { href: "/rapports", label: "Rapports" },
] as const;

export default function MainNav() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className="rounded border border-slate-700 px-2 py-1.5 text-xs hover:bg-slate-800 sm:text-sm"
        >
          {l.label}
        </Link>
      ))}
      <NotificationBell />
    </div>
  );
}
