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

/** Pièces communes à toute demande de résiliation de contrat. */
export const RESILIATION_CHECKLIST_ITEMS_SPEC_71: ProduitDocumentChecklistItem[] = [
  {
    id: "resiliation_demande_signee",
    libelle: "Demande de résiliation signée par le concessionnaire",
    obligatoire: true,
  },
  {
    id: "resiliation_contrat_en_cours",
    libelle: "Copie du contrat en cours",
    obligatoire: true,
  },
  {
    id: "resiliation_justificatif_motif",
    libelle: "Justificatif du motif (selon nature de la résiliation)",
    obligatoire: true,
  },
  {
    id: "resiliation_etat_cautions_commissions",
    libelle: "État de règlement des cautions et commissions en cours",
    obligatoire: true,
  },
  {
    id: "resiliation_restitution_materiel",
    libelle: "Restitution du matériel ou justificatif selon produit",
    obligatoire: true,
  },
];

export function mergeResiliationChecklistTemplate(
  produitCode: string | null | undefined,
  produits: ProduitDocument[],
): ProduitDocumentChecklistItem[] {
  const base = normalizeChecklistTemplate(RESILIATION_CHECKLIST_ITEMS_SPEC_71);
  const code = produitCode?.trim().toUpperCase();
  if (!code) return base;
  const fromProduit = mergeProductChecklistTemplates([code], produits).map((item) => ({
    ...item,
    id: item.id.startsWith("resiliation_") || item.id.startsWith("produit_") ? item.id : `produit_${item.id}`,
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

export function buildResiliationDocumentChecklist(
  produitCode: string | null | undefined,
  produits: ProduitDocument[],
  previous?: DossierDocumentChecklistPayload | null,
): DossierDocumentChecklistPayload {
  const template = mergeResiliationChecklistTemplate(produitCode, produits);
  if (!template.length) return { entries: [], complet: true };
  return buildChecklistFromTemplate(template, previous?.entries ?? null);
}

export function patchResiliationDocumentChecklistStatuts(
  current: DossierDocumentChecklistPayload,
  patch: Array<{ itemId: string; statut: DossierDocumentChecklistStatut }>,
): DossierDocumentChecklistPayload {
  return mergeChecklistStatutPatch(current, patch);
}

export function parseResiliationDocumentChecklist(raw: unknown): DossierDocumentChecklistPayload | null {
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

export function isResiliationChecklistComplete(
  checklist: DossierDocumentChecklistPayload | null | undefined,
): boolean {
  if (!checklist?.entries.length) return true;
  return checklist.complet;
}
