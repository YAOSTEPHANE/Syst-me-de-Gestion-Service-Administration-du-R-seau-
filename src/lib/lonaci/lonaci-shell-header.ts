import type { LonaciKpiPayload } from "@/lib/lonaci/lonaci-kpi-types";

function shortAgenceLibelle(label: string): string {
  if (label.includes(" - ")) return label.split(" - ").slice(1).join(" - ");
  return label;
}

function agenceLabel(agenceKey: string, kpi: LonaciKpiPayload | null): string {
  if (!agenceKey) return "Toutes agences";
  const fromKpi = kpi?.agencesOverview30j?.find((a) => a.agenceId === agenceKey);
  if (fromKpi) return shortAgenceLibelle(fromKpi.agenceLabel) || fromKpi.agenceCode || "Agence";
  const legacy: Record<string, string> = {
    yop1: "Yopougon 1",
    abobo: "Abobo",
    plateau: "Plateau",
    cocody: "Cocody",
    marcory: "Marcory",
  };
  return legacy[agenceKey] ?? "Toutes agences";
}

/** Fuseau explicite pour éviter les écarts d’hydratation SSR / navigateur (Node vs client). */
const LONACI_APP_TIME_ZONE = "Africa/Abidjan";

function dateLine(agenceKey: string, kpi: LonaciKpiPayload | null): string {
  const datePart = new Date().toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: LONACI_APP_TIME_ZONE,
  });
  return `${datePart} · ${agenceLabel(agenceKey, kpi)}`;
}

/** Titres de l'en-tête selon la route (données KPI optionnelles pour les sous-titres dynamiques). */
export function lonaciShellHeader(
  pathname: string,
  kpi: LonaciKpiPayload | null,
  agenceKey: string,
): { title: string; sub: string } {
  const dl = dateLine(agenceKey, kpi);

  if (pathname === "/dashboard" || pathname === "/dashboard/") {
    return { title: "Tableau de bord", sub: dl };
  }
  if (pathname.startsWith("/import")) {
    return { title: "Import", sub: `Données externes · ${dl}` };
  }
  if (pathname.startsWith("/concessionnaires")) {
    const n = kpi?.daily.concessionnaires.total;
    return {
      title: "Concessionnaires",
      sub: n != null ? `${n} PDV · ${dl}` : dl,
    };
  }
  if (pathname.startsWith("/contrats")) {
    const pending = kpi?.dossierValidation.contratSoumis;
    return {
      title: "Contrats",
      sub: pending != null ? `${pending} en attente de validation · ${dl}` : dl,
    };
  }
  if (pathname.startsWith("/cautions")) {
    const a = kpi?.dossierValidation.cautionsEnAttente;
    const j = kpi?.dossierValidation.cautionsJ10;
    const cd = kpi?.alertThresholds?.cautionMaxDays ?? 10;
    return {
      title: "Cautions",
      sub: a != null && j != null ? `${a} en attente · ${j} dépassées J+${cd} · ${dl}` : dl,
    };
  }
  if (pathname.startsWith("/pdv-integrations")) {
    const n = kpi?.daily.pdvIntegrations.nonFinalise;
    const r = kpi?.dossierValidation.pdvEnCoursRetard5j;
    const pd = kpi?.alertThresholds?.pdvIntegrationMaxDays ?? 5;
    return {
      title: "Géolocalisation PDV",
      sub: n != null && r != null ? `${n} en traitement · ${r} > ${pd} j. · ${dl}` : dl,
    };
  }
  if (pathname.startsWith("/agrements")) {
    return { title: "Agréments", sub: `Contrôles et agréments produits · ${dl}` };
  }
  if (pathname.startsWith("/attestations-domiciliation")) {
    return { title: "Attestations & domiciliation", sub: `Demandes, suivi et exports · ${dl}` };
  }
  if (pathname.startsWith("/cessions")) {
    return { title: "Cessions & délocalisations", sub: `Transferts de PDV · ${dl}` };
  }
  if (pathname.startsWith("/resiliations")) {
    return { title: "Résiliations", sub: `Clôture de contrats · ${dl}` };
  }
  if (pathname.startsWith("/succession")) {
    const o = kpi?.dossierValidation.successionOuverts;
    return {
      title: "Décès et ayants droit",
      sub: o != null ? `${o} dossier(s) ouvert(s) · ${dl}` : dl,
    };
  }
  if (pathname.startsWith("/bancarisation")) {
    const b = kpi?.bancarisation;
    return {
      title: "Bancarisation",
      sub: b ? `${b.nonBancarise} non bancarisés · ${b.enCours} en cours · ${dl}` : dl,
    };
  }
  if (pathname.startsWith("/gpr")) {
    return { title: "Création de code grattage", sub: `GPR, lots et codes · ${dl}` };
  }
  if (pathname.startsWith("/rapports") && !pathname.startsWith("/rapports/print")) {
    return { title: "Rapports", sub: `Analyse & exports · ${dl}` };
  }
  if (pathname.startsWith("/parametres")) {
    return { title: "Paramètres", sub: `Configuration · ${dl}` };
  }
  if (pathname.startsWith("/alertes")) {
    return { title: "Toutes les alertes", sub: `Synthèse des alertes · ${dl}` };
  }
  if (pathname.startsWith("/dossiers")) {
    return { title: "Dossiers", sub: `Validation et transitions · ${dl}` };
  }
  if (pathname.startsWith("/carte-pdv")) {
    return { title: "Carte PDV", sub: `Vue géographique · ${dl}` };
  }

  return { title: "Infinitecore Systeme", sub: dl };
}
