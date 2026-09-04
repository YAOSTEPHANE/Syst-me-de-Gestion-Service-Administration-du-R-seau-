import type { ProduitDocumentChecklistItem } from "@/lib/lonaci/types";

/** Identifiant stable de la pièce « acte de décès » (liée au fichier joint à l'ouverture). */
export const SUCCESSION_ACTE_DECES_ITEM_ID = "succession_acte_deces_officiel";

/** Modèle par défaut — circuit documentaire décès et ayants droit (safe Client Components). */
export const SUCCESSION_CHECKLIST_DEFAULT_ITEMS: ProduitDocumentChecklistItem[] = [
  {
    id: SUCCESSION_ACTE_DECES_ITEM_ID,
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
