import { workflowSeparationMessage, WORKFLOW_SEPARATION_MESSAGES } from "@/lib/lonaci/workflow-separation";

export function friendlyErrorMessage(raw: string | null | undefined): string {
  const input = (raw ?? "").toString().trim();
  if (!input) return "Une erreur est survenue.";

  const separationMsg = workflowSeparationMessage(input);
  if (separationMsg) return separationMsg;

  // Heuristique : si c'est déjà une phrase lisible (contient des lettres et pas de code SCREAMING_SNAKE très typé)
  if (/[A-Za-zÀ-ÿ]/.test(input) && !/^[A-Z0-9_]{2,}$/.test(input)) {
    return input;
  }

  const upper = input.toUpperCase();

  const mapped: Record<string, string> = {
    CASE_NOT_FOUND: "Dossier de succession introuvable.",
    CONCESSIONNAIRE_NOT_FOUND: "Le concessionnaire lié est introuvable.",
    AGENCE_FORBIDDEN: "Accès refusé : vous n’avez pas les droits sur cette ressource.",
    ACTE_DECES_REQUIRED: "Acte de décès obligatoire pour cette opération.",
    SUCCESSION_CHECKLIST_INCOMPLETE:
      "Checklist documentaire incomplète : toutes les pièces obligatoires (§10.1) doivent être marquées comme fournies avant la vérification juridique.",
    SUCCESSION_DOCUMENTS_REQUIRED:
      "Documents de succession requis avant la vérification juridique.",
    CONTRAT_NOT_FOUND: "Contrat introuvable.",
    CONTRAT_NOT_ACTIF: "Contrat non actif (opération refusée).",
    CONCESSIONNAIRE_BLOQUE: "Opération interdite (concessionnaire non actif/résilié/décédé).",
    CONCESSIONNAIRE_INSCRIPTION_PENDING:
      "Inscription non finalisée : complétez le parcours (N1 puis paiement caution) avant les modules opérationnels.",
    CONCESSIONNAIRE_INSCRIPTION_CAUTION_NOT_READY:
      "La caution d'inscription ne peut être enregistrée qu'après validation N1 et attribution du code PDV.",
    CAUTION_DEJA_EXONEREE: "Cette caution est déjà exonérée.",
    CAUTION_DEJA_PAYEE: "Caution déjà payée — exonération impossible.",
    CAUTION_EXONERATION_MOTIF_REQUIS: "Motif d'exonération obligatoire (3 caractères minimum).",
    CAUTION_PAYMENT_REFERENCE_REQUISE:
      "Référence de paiement obligatoire pour passer en statut PAYÉE. Régularisez d'abord la fiche provisoire avec la référence d'encaissement.",
    FORBIDDEN_TRANSITION: "Transition non autorisée pour votre profil ou l'état actuel du dossier.",
    ROLE_FORBIDDEN:
      "Action non autorisée pour votre profil. Vérifiez la séparation des rôles (N1 : chef de section, N2 : assistant CDS, finalisation : chef de service).",
    ...WORKFLOW_SEPARATION_MESSAGES,
    CHECKLIST_INCOMPLETE: "Toutes les pièces obligatoires doivent être marquées comme fournies.",
    DOSSIER_CHECKLIST_INCOMPLETE:
      "Soumission impossible : la checklist documents du dossier est incomplète. Marquez tous les documents obligatoires comme « Fourni ».",
    DOSSIER_CLIENT_REQUIRED:
      "Un dossier doit être ouvert sur un client Lonaci avant toute promotion en point de vente.",
    CLIENT_PARCOURS_INCOMPLET:
      "Le client doit terminer son parcours (validation N1, caution payée, statut actif) avant de devenir concessionnaire.",
    CLIENT_ALREADY_PROMOTED: "Ce client est déjà rattaché à un point de vente.",
    CLIENT_NOT_PROMOTED: "Ce client n’est pas encore rattaché à un point de vente.",
    CLIENT_NOT_FOUND: "Client Lonaci introuvable.",
    PHOTO_REQUIRED: "Une photo d'identité est obligatoire avant soumission.",
    NOM_REQUIRED: "Le nom est obligatoire.",
    PRENOM_REQUIRED: "Le prénom est obligatoire.",
    CNI_REQUIRED: "Le numéro CNI est obligatoire pour soumettre l'inscription.",
    TELEPHONE_REQUIRED: "Un numéro de contact principal est obligatoire.",
    GPS_REQUIRED: "La localisation GPS est obligatoire.",
    CESSION_DELOCALISATION_FIELDS_REQUIRED:
      "Cession-délocalisation : cédant, bénéficiaire, produit et nouvelle zone GPS sont obligatoires.",
    CHECKLIST_NOT_SUPPORTED: "Ce type de dossier ne dispose pas de checklist documents.",
    PRODUITS_REQUIRED: "Sélectionnez au moins un produit.",
    CONCESSIONNAIRE_NOT_FOUND_2: "Concessionnaire introuvable.",
  };

  if (mapped[upper]) return mapped[upper];

  if (upper.includes("E11000")) return "Doublon : un enregistrement existe déjà.";
  if (upper.includes("FORBIDDEN")) return "Accès refusé.";
  if (upper.includes("NOT_FOUND")) return "Ressource introuvable.";

  // Fallback : découpe code SCREAMING_SNAKE
  if (/^[A-Z0-9_]{2,}$/.test(upper)) {
    const pretty = upper
      .split("_")
      .filter(Boolean)
      .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
      .join(" ");
    return pretty.endsWith(".") ? pretty : `${pretty}.`;
  }

  return input;
}

