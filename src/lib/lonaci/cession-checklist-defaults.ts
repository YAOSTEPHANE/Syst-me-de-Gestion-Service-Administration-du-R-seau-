import type { ProduitDocumentChecklistItem } from "@/lib/lonaci/types";

/** Pièces obligatoires communes à toute demande de cession (safe Client Components). */
export const CESSION_CHECKLIST_DEFAULT_ITEMS: ProduitDocumentChecklistItem[] = [
  {
    id: "cession_identite_parties",
    libelle: "Pièces d'identité des deux parties (cédant et cessionnaire)",
    obligatoire: true,
  },
  {
    id: "cession_contrat_cedant",
    libelle: "Copie du contrat en cours du cédant",
    obligatoire: true,
  },
  {
    id: "cession_quitus_cautions",
    libelle: "Quitus de paiement des cautions",
    obligatoire: true,
  },
  {
    id: "cession_formulaire_signe",
    libelle: "Formulaire de demande de cession signé",
    obligatoire: true,
  },
];
