import {
  buildCessionDocumentChecklist,
  isCessionChecklistComplete,
  mergeCessionChecklistTemplate,
  parseCessionDocumentChecklist,
  patchCessionDocumentChecklistStatuts,
} from "@/lib/lonaci/cession-document-checklist";
import {
  buildDelocalisationDocumentChecklist,
  isDelocalisationChecklistComplete,
  mergeDelocalisationChecklistTemplate,
  parseDelocalisationDocumentChecklist,
  patchDelocalisationDocumentChecklistStatuts,
} from "@/lib/lonaci/delocalisation-document-checklist";
import { buildChecklistFromTemplate, normalizeChecklistTemplate } from "@/lib/lonaci/produit-document-checklist";
import type {
  DossierDocumentChecklistPayload,
  DossierDocumentChecklistStatut,
  ProduitDocument,
} from "@/lib/lonaci/types";

export type CessionDossierKind = "CESSION" | "DELOCALISATION" | "CESSION_DELOCALISATION";

export function usesSimplifiedDelocalisationCircuit(kind: CessionDossierKind): boolean {
  return kind === "DELOCALISATION";
}

/** Spec 6.2 — fusion des gabarits cession + délocalisation. */
export function mergeCessionDelocalisationChecklistTemplate(
  produitCode: string | null | undefined,
  produits: ProduitDocument[],
) {
  const cession = mergeCessionChecklistTemplate(produitCode, produits);
  const deloc = mergeDelocalisationChecklistTemplate(produitCode, produits);
  const seen = new Set<string>();
  const merged = [];
  for (const item of [...cession, ...deloc]) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    merged.push(item);
  }
  return merged;
}

export function buildDocumentChecklistForKind(
  kind: CessionDossierKind,
  produitCode: string | null | undefined,
  produits: ProduitDocument[],
  previous?: DossierDocumentChecklistPayload | null,
): DossierDocumentChecklistPayload {
  if (kind === "CESSION") {
    return buildCessionDocumentChecklist(produitCode, produits, previous);
  }
  if (kind === "DELOCALISATION") {
    return buildDelocalisationDocumentChecklist(produitCode, produits, previous);
  }
  const template = mergeCessionDelocalisationChecklistTemplate(produitCode, produits);
  if (!template.length) return { entries: [], complet: true };
  return buildChecklistFromTemplate(template, previous?.entries ?? null);
}

export function parseDocumentChecklistForKind(
  kind: CessionDossierKind,
  raw: unknown,
): DossierDocumentChecklistPayload | null {
  if (kind === "CESSION") return parseCessionDocumentChecklist(raw);
  if (kind === "DELOCALISATION") return parseDelocalisationDocumentChecklist(raw);
  return parseCessionDocumentChecklist(raw) ?? parseDelocalisationDocumentChecklist(raw);
}

export function isDocumentChecklistCompleteForKind(
  kind: CessionDossierKind,
  checklist: DossierDocumentChecklistPayload | null | undefined,
): boolean {
  if (kind === "CESSION") return isCessionChecklistComplete(checklist);
  if (kind === "DELOCALISATION") return isDelocalisationChecklistComplete(checklist);
  return isCessionChecklistComplete(checklist) && isDelocalisationChecklistComplete(checklist);
}

export function patchDocumentChecklistStatutsForKind(
  kind: CessionDossierKind,
  current: DossierDocumentChecklistPayload,
  patch: Array<{ itemId: string; statut: DossierDocumentChecklistStatut }>,
): DossierDocumentChecklistPayload {
  if (kind === "CESSION") return patchCessionDocumentChecklistStatuts(current, patch);
  if (kind === "DELOCALISATION") return patchDelocalisationDocumentChecklistStatuts(current, patch);
  return patchCessionDocumentChecklistStatuts(current, patch);
}

export function kindHasDocumentChecklist(kind: CessionDossierKind): boolean {
  return kind === "CESSION" || kind === "DELOCALISATION" || kind === "CESSION_DELOCALISATION";
}
