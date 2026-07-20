/** Parcours génération contrat (spec module Contrats — points 6 à 10). */

export const CONTRAT_GENERATION_STEPS = [
  "Informations client pré-remplies depuis la fiche concessionnaire / client",
  "Référence de paiement de la caution intégrée au contrat",
  "Un contrat et une annexe générés par produit du dossier",
  "Soumission au circuit de validation à 4 niveaux (Soumis → N1 → N2 → Final)",
  "À la validation finale (Chef de Service) : titulaire actif dans le système",
  "Contrats et annexes signés archivés et téléchargeables en PDF",
] as const;

export const CONTRAT_GENERATION_SUMMARY =
  "À partir de la décharge définitive validée, le système génère le contrat et l’annexe de chaque produit puis soumet le dossier au circuit de validation.";
