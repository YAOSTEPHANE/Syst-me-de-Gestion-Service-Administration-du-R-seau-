/** Parcours génération contrat (spec module Contrats — points 6 à 10). */

export const CONTRAT_GENERATION_STEPS = [
  "Informations client pré-remplies depuis la fiche concessionnaire / client",
  "Référence de paiement de la caution intégrée au contrat",
  "Soumission au circuit de validation à 4 niveaux (Soumis → N1 → N2 → Final)",
  "À la validation finale (Chef de Service) : titulaire actif dans le système",
  "Contrat signé archivé et téléchargeable en PDF",
] as const;

export const CONTRAT_GENERATION_SUMMARY =
  "À partir de la décharge définitive validée, le système génère le contrat complet puis le soumet au circuit de validation.";
