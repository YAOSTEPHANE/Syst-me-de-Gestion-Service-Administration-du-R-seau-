import type { ProduitDocumentChecklistItem } from "@/lib/lonaci/types";

/**
 * Pièces communes à fournir pour la signature / constitution d’un dossier contrat.
 * Safe pour Client Components (pas de server-only).
 */
export const CONTRAT_CHECKLIST_DEFAULT_ITEMS: ProduitDocumentChecklistItem[] = [
  {
    id: "contrat_piece_identite",
    libelle: "Pièce d'identité en cours de validité (CNI ou passeport)",
    obligatoire: true,
  },
  {
    id: "contrat_justificatif_domicile",
    libelle: "Justificatif de domicile récent",
    obligatoire: true,
  },
  {
    id: "contrat_photo_identite",
    libelle: "Photo d'identité",
    obligatoire: true,
  },
  {
    id: "contrat_formulaire_demande",
    libelle: "Formulaire de demande de contrat signé",
    obligatoire: true,
  },
  {
    id: "contrat_quitus_caution",
    libelle: "Quitus ou preuve de paiement de la caution",
    obligatoire: true,
  },
  {
    id: "contrat_localisation_pdv",
    libelle: "Plan ou attestation de localisation du point de vente",
    obligatoire: true,
  },
];
