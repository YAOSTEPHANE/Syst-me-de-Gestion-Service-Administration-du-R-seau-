import { computeChecklistProgress } from "@/lib/lonaci/produit-document-checklist";
import type { DossierDocumentChecklistPayload } from "@/lib/lonaci/types";

export function resiliationChecklistProgress(checklist: DossierDocumentChecklistPayload | null | undefined) {
  if (!checklist?.entries.length) {
    return { complet: true, obligatoiresFournis: 0, obligatoiresTotal: 0 };
  }
  const statuts = Object.fromEntries(checklist.entries.map((e) => [e.itemId, e.statut]));
  return computeChecklistProgress(checklist.entries, statuts);
}
