import type {
  DossierDocumentChecklistEntry,
  DossierDocumentChecklistPayload,
  DossierDocumentChecklistStatut,
  ProduitDocument,
  ProduitDocumentChecklistItem,
} from "@/lib/lonaci/types";

const OTHER_PRODUCT_CODE = "AUTRES";

export const DOSSIER_CHECKLIST_STATUT_VALUES = ["FOURNI", "MANQUANT", "EN_ATTENTE"] as const;

export const DOSSIER_CHECKLIST_STATUTS: DossierDocumentChecklistStatut[] = [
  ...DOSSIER_CHECKLIST_STATUT_VALUES,
];

export const DOSSIER_CHECKLIST_STATUT_LABELS: Record<DossierDocumentChecklistStatut, string> = {
  FOURNI: "Fourni",
  MANQUANT: "Manquant",
  EN_ATTENTE: "En attente",
};

const PAYLOAD_KEY = "documentChecklist";

export function normalizeChecklistTemplate(
  items: Array<Partial<ProduitDocumentChecklistItem> & { libelle?: string }> | null | undefined,
): ProduitDocumentChecklistItem[] {
  if (!Array.isArray(items)) return [];
  const seen = new Set<string>();
  const out: ProduitDocumentChecklistItem[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const libelle = String(raw.libelle ?? "").trim();
    if (libelle.length < 2) continue;
    let id = String(raw.id ?? "").trim();
    if (!id) {
      id = `doc_${out.length + 1}`;
    }
    if (seen.has(id)) {
      id = `${id}_${out.length + 1}`;
    }
    seen.add(id);
    out.push({
      id,
      libelle,
      obligatoire: raw.obligatoire !== false,
      ...(raw.annexe === true ? { annexe: true } : {}),
    });
  }
  return out;
}

export function isChecklistStatut(value: unknown): value is DossierDocumentChecklistStatut {
  return typeof value === "string" && DOSSIER_CHECKLIST_STATUTS.includes(value as DossierDocumentChecklistStatut);
}

export function computeChecklistComplet(entries: DossierDocumentChecklistEntry[]): boolean {
  if (!entries.length) return true;
  return entries.every((e) => !e.obligatoire || e.statut === "FOURNI");
}

/** Calcul temps réel (UI) à partir des statuts locaux par itemId. */
export function computeChecklistProgress(
  entries: DossierDocumentChecklistEntry[],
  statuts: Record<string, DossierDocumentChecklistStatut>,
): { obligatoiresTotal: number; obligatoiresFournis: number; complet: boolean } {
  const obligatoires = entries.filter((e) => e.obligatoire);
  const obligatoiresFournis = obligatoires.filter((e) => statuts[e.itemId] === "FOURNI").length;
  const obligatoiresTotal = obligatoires.length;
  return {
    obligatoiresTotal,
    obligatoiresFournis,
    complet: obligatoiresTotal === 0 || obligatoiresFournis === obligatoiresTotal,
  };
}

export function buildChecklistFromTemplate(
  template: ProduitDocumentChecklistItem[],
  previous?: DossierDocumentChecklistEntry[] | null,
): DossierDocumentChecklistPayload {
  const prevMap = new Map((previous ?? []).map((e) => [e.itemId, e.statut]));
  const entries: DossierDocumentChecklistEntry[] = template.map((item) => {
    const prevStatut = prevMap.get(item.id);
    return {
      itemId: item.id,
      libelle: item.libelle,
      obligatoire: item.obligatoire !== false,
      statut: prevStatut && isChecklistStatut(prevStatut) ? prevStatut : "EN_ATTENTE",
      ...(item.annexe === true ? { annexe: true } : {}),
    };
  });
  return { entries, complet: computeChecklistComplet(entries) };
}

export function parseDocumentChecklistPayload(
  payload: Record<string, unknown> | null | undefined,
): DossierDocumentChecklistPayload | null {
  const raw = payload?.[PAYLOAD_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.entries)) return null;
  const entries: DossierDocumentChecklistEntry[] = [];
  for (const row of obj.entries) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const itemId = String(r.itemId ?? "").trim();
    const libelle = String(r.libelle ?? "").trim();
    if (!itemId || !libelle) continue;
    const statut = isChecklistStatut(r.statut) ? r.statut : "EN_ATTENTE";
    entries.push({
      itemId,
      libelle,
      obligatoire: r.obligatoire !== false,
      statut,
      ...(r.annexe === true ? { annexe: true } : {}),
    });
  }
  const complet =
    typeof obj.complet === "boolean" ? obj.complet : computeChecklistComplet(entries);
  return { entries, complet };
}

export function serializeDocumentChecklistPayload(
  checklist: DossierDocumentChecklistPayload,
): Record<string, unknown> {
  return {
    [PAYLOAD_KEY]: {
      entries: checklist.entries,
      complet: checklist.complet,
    },
  };
}

export function mergeChecklistStatutPatch(
  current: DossierDocumentChecklistPayload,
  patch: Array<{ itemId: string; statut: DossierDocumentChecklistStatut }>,
): DossierDocumentChecklistPayload {
  const patchMap = new Map(patch.map((p) => [p.itemId.trim(), p.statut]));
  const entries = current.entries.map((entry) => {
    const nextStatut = patchMap.get(entry.itemId);
    if (!nextStatut) return entry;
    return { ...entry, statut: nextStatut };
  });
  return { entries, complet: computeChecklistComplet(entries) };
}

/** Indique si le dossier a une checklist produit et si elle est complète (null = pas de checklist). */
export function readDossierChecklistComplet(
  payload: Record<string, unknown> | null | undefined,
): boolean | null {
  const checklist = parseDocumentChecklistPayload(payload ?? {});
  if (!checklist?.entries.length) return null;
  return checklist.complet;
}

export function ensureDossierDocumentChecklist(
  payload: Record<string, unknown>,
  template: ProduitDocumentChecklistItem[],
): DossierDocumentChecklistPayload {
  const existing = parseDocumentChecklistPayload(payload);
  if (!template.length) {
    return existing ?? { entries: [], complet: true };
  }
  if (!existing) {
    return buildChecklistFromTemplate(template);
  }
  const templateIds = new Set(template.map((t) => t.id));
  const sameShape =
    existing.entries.length === template.length &&
    existing.entries.every((e) => templateIds.has(e.itemId));
  if (sameShape) {
    return {
      entries: existing.entries,
      complet: computeChecklistComplet(existing.entries),
    };
  }
  return buildChecklistFromTemplate(template, existing.entries);
}

export function mergeProductAnnexeTemplates(produitCodes: string[], produits: ProduitDocument[]) {
  const seen = new Set<string>();
  const merged: ReturnType<typeof normalizeChecklistTemplate> = [];
  for (const rawCode of produitCodes) {
    const code = rawCode.trim().toUpperCase();
    if (!code || code === OTHER_PRODUCT_CODE) continue;
    const produit = produits.find((p) => p.code.trim().toUpperCase() === code);
    for (const item of normalizeChecklistTemplate(produit?.documentsAnnexe)) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      merged.push({ ...item, annexe: true });
    }
  }
  return merged;
}

/** Pièces dossier + documents annexe contrat (union dédupliquée par id). */
export function mergeProductDossierAndAnnexeTemplates(produitCodes: string[], produits: ProduitDocument[]) {
  const dossier = mergeProductChecklistTemplates(produitCodes, produits);
  const annexe = mergeProductAnnexeTemplates(produitCodes, produits);
  const seen = new Set(dossier.map((item) => item.id));
  const merged = [...dossier];
  for (const item of annexe) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    merged.push(item);
  }
  return merged;
}

export function mergeProductChecklistTemplates(produitCodes: string[], produits: ProduitDocument[]) {
  const seen = new Set<string>();
  const merged: ReturnType<typeof normalizeChecklistTemplate> = [];
  for (const rawCode of produitCodes) {
    const code = rawCode.trim().toUpperCase();
    if (!code || code === OTHER_PRODUCT_CODE) continue;
    const produit = produits.find((p) => p.code.trim().toUpperCase() === code);
    for (const item of normalizeChecklistTemplate(produit?.documentsChecklist)) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      merged.push(item);
    }
  }
  return merged;
}
