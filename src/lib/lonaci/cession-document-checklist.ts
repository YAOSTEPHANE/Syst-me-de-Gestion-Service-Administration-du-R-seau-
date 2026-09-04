import { mergeProductChecklistTemplates } from "@/lib/lonaci/produit-document-checklist";
import {
  buildChecklistFromTemplate,
  computeChecklistComplet,
  isChecklistStatut,
  mergeChecklistStatutPatch,
  normalizeChecklistTemplate,
} from "@/lib/lonaci/produit-document-checklist";
import { CESSION_CHECKLIST_DEFAULT_ITEMS } from "@/lib/lonaci/cession-checklist-defaults";
import type {
  DossierDocumentChecklistPayload,
  DossierDocumentChecklistStatut,
  ProduitDocument,
  ProduitDocumentChecklistItem,
} from "@/lib/lonaci/types";

/** @deprecated Utiliser CESSION_CHECKLIST_DEFAULT_ITEMS */
export const CESSION_CHECKLIST_ITEMS_SPEC_52 = CESSION_CHECKLIST_DEFAULT_ITEMS;

export function mergeCessionChecklistTemplate(
  produitCode: string | null | undefined,
  produits: ProduitDocument[],
  baseItems: ProduitDocumentChecklistItem[] = CESSION_CHECKLIST_DEFAULT_ITEMS,
): ProduitDocumentChecklistItem[] {
  const base = normalizeChecklistTemplate(baseItems);
  const code = produitCode?.trim().toUpperCase();
  if (!code) return base;
  const fromProduit = mergeProductChecklistTemplates([code], produits).map((item) => ({
    ...item,
    id: item.id.startsWith("cession_") || item.id.startsWith("produit_") ? item.id : `produit_${item.id}`,
    libelle: item.libelle,
    obligatoire: item.obligatoire,
  }));
  const seen = new Set(base.map((b) => b.id));
  for (const item of fromProduit) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    base.push(item);
  }
  return base;
}

export function buildCessionDocumentChecklist(
  produitCode: string | null | undefined,
  produits: ProduitDocument[],
  previous?: DossierDocumentChecklistPayload | null,
  baseItems?: ProduitDocumentChecklistItem[],
): DossierDocumentChecklistPayload {
  const template = mergeCessionChecklistTemplate(produitCode, produits, baseItems);
  if (!template.length) return { entries: [], complet: true };
  return buildChecklistFromTemplate(template, previous?.entries ?? null);
}

export function patchCessionDocumentChecklistStatuts(
  current: DossierDocumentChecklistPayload,
  patch: Array<{ itemId: string; statut: DossierDocumentChecklistStatut }>,
): DossierDocumentChecklistPayload {
  return mergeChecklistStatutPatch(current, patch);
}

export function parseCessionDocumentChecklist(raw: unknown): DossierDocumentChecklistPayload | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.entries)) return null;
  const entries = obj.entries
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const r = row as Record<string, unknown>;
      const itemId = String(r.itemId ?? "").trim();
      const libelle = String(r.libelle ?? "").trim();
      if (!itemId || !libelle) return null;
      const statut = isChecklistStatut(r.statut) ? r.statut : "EN_ATTENTE";
      return {
        itemId,
        libelle,
        obligatoire: r.obligatoire !== false,
        statut,
      };
    })
    .filter((e): e is NonNullable<typeof e> => e !== null);
  const complet =
    typeof obj.complet === "boolean" ? obj.complet : computeChecklistComplet(entries);
  return { entries, complet };
}

export function isCessionChecklistComplete(
  checklist: DossierDocumentChecklistPayload | null | undefined,
): boolean {
  if (!checklist?.entries.length) return true;
  return checklist.complet;
}
