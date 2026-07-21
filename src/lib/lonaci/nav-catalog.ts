export type NavCatalogItem = {
  href: string;
  section?: string;
};

export type ResolvedNavCatalogItem<T extends NavCatalogItem = NavCatalogItem> = T & {
  resolvedSection: string;
};

export type MenuOrderSection = {
  section: string;
  hrefs: string[];
};

export type MenuOrderValidationIssue = {
  path: Array<string | number>;
  message: string;
};

export const LONACI_NAV_CATALOG = [
  { href: "/dashboard", label: "Tableau de bord", section: "Principal" },
  { href: "/clients", label: "Clients", section: "Parcours" },
  { href: "/dossiers", label: "Dossiers" },
  { href: "/cautions", label: "Cautions" },
  { href: "/concessionnaires", label: "Concessionnaires" },
  { href: "/contrats", label: "Contrats" },
  { href: "/agrements", label: "Agréments" },
  { href: "/pdv-integrations", label: "Géolocalisation PDV" },
  { href: "/attestations-domiciliation", label: "Attestations & domiciliation" },
  { href: "/bancarisation", label: "Bancarisation" },
  { href: "/cessions", label: "Cessions & Déloc.", section: "Opérations" },
  { href: "/resiliations", label: "Résiliations" },
  { href: "/succession", label: "Décès et ayants droit" },
  { href: "/gpr", label: "Création de code grattage" },
  { href: "/contrats-grattage", label: "Contrats grattage" },
  { href: "/dispatcher", label: "Dispatcher codes grattage", section: "Opérations" },
  { href: "/registres", label: "Registres" },
  { href: "/carte-pdv", label: "Carte PDV", section: "Pilotage" },
  { href: "/rapports", label: "Rapports" },
  { href: "/alertes", label: "Toutes les alertes" },
  { href: "/assistant-operations", label: "Assistant opérations" },
  { href: "/import", label: "Import", section: "Administration" },
  { href: "/parametres", label: "Paramètres" },
] as const satisfies ReadonlyArray<NavCatalogItem & { label: string }>;

export type KnownNavHref = (typeof LONACI_NAV_CATALOG)[number]["href"];

export function resolveInheritedNavSections<T extends NavCatalogItem>(
  items: readonly T[],
): Array<ResolvedNavCatalogItem<T>> {
  let currentSection: string | null = null;
  return items.map((item) => {
    if (item.section) currentSection = item.section;
    if (!currentSection) {
      throw new Error(`La section du module ${item.href} est introuvable.`);
    }
    return { ...item, resolvedSection: currentSection };
  });
}

export function getDefaultMenuOrder<T extends NavCatalogItem>(
  items: readonly T[],
): MenuOrderSection[] {
  const sections = new Map<string, string[]>();
  for (const item of resolveInheritedNavSections(items)) {
    const hrefs = sections.get(item.resolvedSection) ?? [];
    hrefs.push(item.href);
    sections.set(item.resolvedSection, hrefs);
  }
  return Array.from(sections, ([section, hrefs]) => ({ section, hrefs }));
}

export function validateMenuOrder(
  order: readonly MenuOrderSection[],
  items: readonly NavCatalogItem[],
): MenuOrderValidationIssue[] {
  const resolved = resolveInheritedNavSections(items);
  const sectionByHref = new Map(resolved.map((item) => [item.href, item.resolvedSection]));
  const knownSections = new Set(resolved.map((item) => item.resolvedSection));
  const seenSections = new Set<string>();
  const seenHrefs = new Set<string>();
  const issues: MenuOrderValidationIssue[] = [];

  order.forEach((entry, sectionIndex) => {
    if (!knownSections.has(entry.section)) {
      issues.push({
        path: [sectionIndex, "section"],
        message: `Section inconnue : ${entry.section}.`,
      });
    }
    if (seenSections.has(entry.section)) {
      issues.push({
        path: [sectionIndex, "section"],
        message: `La section ${entry.section} est présente plusieurs fois.`,
      });
    }
    seenSections.add(entry.section);

    entry.hrefs.forEach((href, hrefIndex) => {
      const expectedSection = sectionByHref.get(href);
      if (!expectedSection) {
        issues.push({
          path: [sectionIndex, "hrefs", hrefIndex],
          message: `Module inconnu : ${href}.`,
        });
      } else if (expectedSection !== entry.section) {
        issues.push({
          path: [sectionIndex, "hrefs", hrefIndex],
          message: `${href} appartient à la section ${expectedSection}, pas à ${entry.section}.`,
        });
      }
      if (seenHrefs.has(href)) {
        issues.push({
          path: [sectionIndex, "hrefs", hrefIndex],
          message: `Le module ${href} est présent plusieurs fois.`,
        });
      }
      seenHrefs.add(href);
    });
  });

  return issues;
}

export function mergeMenuOrder<T extends NavCatalogItem>(
  items: readonly T[],
  storedOrder: readonly MenuOrderSection[] | null | undefined,
): Array<ResolvedNavCatalogItem<T>> {
  const resolved = resolveInheritedNavSections(items);
  const byHref = new Map(resolved.map((item) => [item.href, item]));
  const defaultOrder = getDefaultMenuOrder(items);
  const requestedBySection = new Map<string, string[]>();
  const seen = new Set<string>();

  for (const entry of storedOrder ?? []) {
    if (requestedBySection.has(entry.section)) continue;
    const validHrefs: string[] = [];
    for (const href of entry.hrefs) {
      const item = byHref.get(href);
      if (!item || item.resolvedSection !== entry.section || seen.has(href)) continue;
      validHrefs.push(href);
      seen.add(href);
    }
    requestedBySection.set(entry.section, validHrefs);
  }

  const merged: Array<ResolvedNavCatalogItem<T>> = [];
  for (const section of defaultOrder) {
    const requested = requestedBySection.get(section.section) ?? [];
    const missing = section.hrefs.filter((href) => !seen.has(href));
    for (const href of [...requested, ...missing]) {
      const item = byHref.get(href);
      if (item) merged.push(item);
    }
  }
  return merged;
}

export function toMenuOrder<T extends NavCatalogItem>(
  items: readonly ResolvedNavCatalogItem<T>[],
): MenuOrderSection[] {
  const sections = new Map<string, string[]>();
  for (const item of items) {
    const hrefs = sections.get(item.resolvedSection) ?? [];
    hrefs.push(item.href);
    sections.set(item.resolvedSection, hrefs);
  }
  return Array.from(sections, ([section, hrefs]) => ({ section, hrefs }));
}
