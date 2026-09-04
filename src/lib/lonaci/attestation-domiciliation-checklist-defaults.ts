import type { ProduitDocumentChecklistItem } from "@/lib/lonaci/types";

/** Modèle par défaut (première installation) — safe pour Client Components. */
export const ATTESTATION_DOMICILIATION_CHECKLIST_DEFAULT_ITEMS: ProduitDocumentChecklistItem[] = [
  {
    id: "attest_domic_rib_original",
    libelle: "Original du relevé d'identité bancaire",
    obligatoire: true,
  },
  {
    id: "attest_domic_contrat_pages",
    libelle: "Copie de la première et de la dernière page du contrat",
    obligatoire: true,
  },
  {
    id: "attest_domic_annexe_pages",
    libelle: "Copie de la première et de la dernière page de l'annexe",
    obligatoire: true,
  },
  {
    id: "attest_domic_cni_couleur",
    libelle: "Origine et copie couleur de la CNI en cours de validité",
    obligatoire: true,
  },
  {
    id: "attest_domic_courrier_dg",
    libelle: "Courrier d'attestation de revenus et de domiciliation addressé au DG",
    obligatoire: true,
  },
];
