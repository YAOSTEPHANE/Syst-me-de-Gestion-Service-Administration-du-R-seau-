import {
  buildChecklistFromTemplate,
  computeChecklistComplet,
  computeChecklistProgress,
  isChecklistStatut,
  mergeChecklistStatutPatch,
  normalizeChecklistTemplate,
} from "@/lib/lonaci/produit-document-checklist";
import type {
  DossierDocumentChecklistPayload,
  DossierDocumentChecklistStatut,
  ProduitDocumentChecklistItem,
} from "@/lib/lonaci/types";

/** §10.1 — Circuit documentaire décès et ayants droit. */
export const SUCCESSION_CHECKLIST_ITEMS_SPEC_101: ProduitDocumentChecklistItem[] = [
  {
    id: "succession_acte_deces_officiel",
    libelle: "Acte de décès officiel",
    obligatoire: true,
  },
  {
    id: "succession_identite_ayant_droit",
    libelle: "Pièce d'identité de l'ayant droit",
    obligatoire: true,
  },
  {
    id: "succession_lien_parente",
    libelle: "Justificatif du lien de parenté (acte de naissance, certificat de mariage, etc.)",
    obligatoire: true,
  },
  {
    id: "succession_demande_transfert_resiliation",
    libelle: "Demande de transfert ou de résiliation signée par l'ayant droit",
    obligatoire: true,
  },
  {
    id: "succession_contrat_defunt",
    libelle: "Copie du contrat du défunt",
    obligatoire: true,
  },
  {
    id: "succession_ohada_complement",
    libelle: "Tout document supplémentaire requis selon la réglementation OHADA",
    obligatoire: false,
  },
];

export const SUCCESSION_CHECKLIST_SPEC_101 = normalizeChecklistTemplate(
  SUCCESSION_CHECKLIST_ITEMS_SPEC_101,
).map((item) => ({
  itemId: item.id,
  libelle: item.libelle,
  obligatoire: item.obligatoire,
}));

export function buildSuccessionDocumentChecklist(
  options?: { acteDecesUploaded?: boolean },
  previous?: DossierDocumentChecklistPayload | null,
): DossierDocumentChecklistPayload {
  const template = normalizeChecklistTemplate(SUCCESSION_CHECKLIST_ITEMS_SPEC_101);
  const checklist = buildChecklistFromTemplate(template, previous?.entries ?? null);
  if (!options?.acteDecesUploaded) return checklist;
  const entries = checklist.entries.map((e) =>
    e.itemId === "succession_acte_deces_officiel" ? { ...e, statut: "FOURNI" as const } : e,
  );
  return { entries, complet: computeChecklistComplet(entries) };
}

export function patchSuccessionDocumentChecklistStatuts(
  current: DossierDocumentChecklistPayload,
  patch: Array<{ itemId: string; statut: DossierDocumentChecklistStatut }>,
): DossierDocumentChecklistPayload {
  return mergeChecklistStatutPatch(current, patch);
}

export function parseSuccessionDocumentChecklist(raw: unknown): DossierDocumentChecklistPayload | null {
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

export function isSuccessionChecklistComplete(
  checklist: DossierDocumentChecklistPayload | null | undefined,
): boolean {
  if (!checklist?.entries.length) return false;
  return checklist.complet;
}

export function successionChecklistProgress(checklist: DossierDocumentChecklistPayload | null | undefined) {
  if (!checklist?.entries.length) {
    return { complet: false, obligatoiresFournis: 0, obligatoiresTotal: 0 };
  }
  const statuts = Object.fromEntries(checklist.entries.map((e) => [e.itemId, e.statut]));
  return computeChecklistProgress(checklist.entries, statuts);
}

export function successionChecklistWithActeDeces(
  checklist: DossierDocumentChecklistPayload,
  acteDecesPresent: boolean,
): DossierDocumentChecklistPayload {
  if (!acteDecesPresent) return checklist;
  return patchSuccessionDocumentChecklistStatuts(
    checklist,
    [{ itemId: "succession_acte_deces_officiel", statut: "FOURNI" }],
  );
}
