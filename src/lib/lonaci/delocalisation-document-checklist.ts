import { mergeProductChecklistTemplates } from "@/lib/lonaci/produit-document-checklist";
import {
  buildChecklistFromTemplate,
  computeChecklistComplet,
  isChecklistStatut,
  mergeChecklistStatutPatch,
  normalizeChecklistTemplate,
} from "@/lib/lonaci/produit-document-checklist";
import type {
  DossierDocumentChecklistPayload,
  DossierDocumentChecklistStatut,
  ProduitDocument,
  ProduitDocumentChecklistItem,
} from "@/lib/lonaci/types";

/** Spec 6.1 — pièces communes à toute demande de délocalisation. */
export const DELOCALISATION_CHECKLIST_ITEMS_SPEC_61: ProduitDocumentChecklistItem[] = [
  {
    id: "deloc_formulaire_signe",
    libelle: "Formulaire de demande de délocalisation signé",
    obligatoire: true,
  },
  {
    id: "deloc_identite_concessionnaire",
    libelle: "Pièce d'identité du concessionnaire",
    obligatoire: true,
  },
  {
    id: "deloc_justificatif_nouveau_site",
    libelle: "Justificatif du nouveau site (bail, attestation, plan…)",
    obligatoire: true,
  },
  {
    id: "deloc_contrat_en_cours",
    libelle: "Copie du contrat en cours (conservation du contrat)",
    obligatoire: true,
  },
];

export function mergeDelocalisationChecklistTemplate(
  produitCode: string | null | undefined,
  produits: ProduitDocument[],
): ProduitDocumentChecklistItem[] {
  const base = normalizeChecklistTemplate(DELOCALISATION_CHECKLIST_ITEMS_SPEC_61);
  const code = produitCode?.trim().toUpperCase();
  if (!code) return base;
  const fromProduit = mergeProductChecklistTemplates([code], produits).map((item) => ({
    ...item,
    id: item.id.startsWith("deloc_") || item.id.startsWith("produit_") ? item.id : `produit_${item.id}`,
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

export function buildDelocalisationDocumentChecklist(
  produitCode: string | null | undefined,
  produits: ProduitDocument[],
  previous?: DossierDocumentChecklistPayload | null,
): DossierDocumentChecklistPayload {
  const template = mergeDelocalisationChecklistTemplate(produitCode, produits);
  if (!template.length) return { entries: [], complet: true };
  return buildChecklistFromTemplate(template, previous?.entries ?? null);
}

export function patchDelocalisationDocumentChecklistStatuts(
  current: DossierDocumentChecklistPayload,
  patch: Array<{ itemId: string; statut: DossierDocumentChecklistStatut }>,
): DossierDocumentChecklistPayload {
  return mergeChecklistStatutPatch(current, patch);
}

export function parseDelocalisationDocumentChecklist(raw: unknown): DossierDocumentChecklistPayload | null {
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

export function isDelocalisationChecklistComplete(
  checklist: DossierDocumentChecklistPayload | null | undefined,
): boolean {
  if (!checklist?.entries.length) return true;
  return checklist.complet;
}
