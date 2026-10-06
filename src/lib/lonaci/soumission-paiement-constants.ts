/** Montant fixe à verser à la caisse pour une soumission (phoning). */
export const SOUMISSION_PAIEMENT_CAISSE_MONTANT_FCFA = 100_000;

export const SOUMISSION_FICHE_PAIEMENT_TITLE = "Fiche de paiement caisse";

/**
 * Les polices standard de jsPDF n'ont pas U+202F / U+00A0 (séparateurs fr-FR) et les rendent en « / ».
 */
export function formatSoumissionPaiementMontant(value = SOUMISSION_PAIEMENT_CAISSE_MONTANT_FCFA): string {
  return `${value.toLocaleString("fr-FR").replace(/[\u202f\u00a0]/g, " ")} FCFA`;
}
