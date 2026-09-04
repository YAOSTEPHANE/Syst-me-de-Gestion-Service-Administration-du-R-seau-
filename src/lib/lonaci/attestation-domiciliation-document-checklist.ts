import {
  buildChecklistFromTemplate,
  computeChecklistComplet,
  isChecklistStatut,
  mergeChecklistStatutPatch,
  normalizeChecklistTemplate,
} from "@/lib/lonaci/produit-document-checklist";
import { ATTESTATION_DOMICILIATION_CHECKLIST_DEFAULT_ITEMS } from "@/lib/lonaci/attestation-domiciliation-checklist-defaults";
import type {
  DossierDocumentChecklistPayload,
  DossierDocumentChecklistStatut,
  ProduitDocumentChecklistItem,
} from "@/lib/lonaci/types";

/** @deprecated Utiliser le référentiel admin ou `getAttestationDomiciliationChecklistTemplate`. */
export const ATTESTATION_DOMICILIATION_CHECKLIST_ITEMS = ATTESTATION_DOMICILIATION_CHECKLIST_DEFAULT_ITEMS;

export function buildAttestationDomiciliationDocumentChecklist(
  template: ProduitDocumentChecklistItem[] = ATTESTATION_DOMICILIATION_CHECKLIST_DEFAULT_ITEMS,
  previous?: DossierDocumentChecklistPayload | null,
): DossierDocumentChecklistPayload {
  const normalized = normalizeChecklistTemplate(template);
  if (!normalized.length) return { entries: [], complet: true };
  return buildChecklistFromTemplate(normalized, previous?.entries ?? null);
}

export function patchAttestationDomiciliationDocumentChecklistStatuts(
  current: DossierDocumentChecklistPayload,
  patch: Array<{ itemId: string; statut: DossierDocumentChecklistStatut }>,
): DossierDocumentChecklistPayload {
  return mergeChecklistStatutPatch(current, patch);
}

export function parseAttestationDomiciliationDocumentChecklist(
  raw: unknown,
): DossierDocumentChecklistPayload | null {
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

export function isAttestationDomiciliationChecklistComplete(
  checklist: DossierDocumentChecklistPayload | null | undefined,
): boolean {
  if (!checklist?.entries.length) return true;
  return checklist.complet;
}
