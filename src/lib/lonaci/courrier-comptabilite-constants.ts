/** Libellés courrier comptabilité client (client + serveur). */

export const COURRIER_COMPTABILITE_TITLE = "COURRIER À TRANSMETTRE À VOTRE COMPTABILITÉ";
export const COURRIER_COMPTABILITE_OBJET = "Attestation de paiement de caution concessionnaire LONACI";
export const COURRIER_COMPTABILITE_DESCRIPTION =
  "Lettre officielle remise au concessionnaire pour transmission à son service comptable (montant, référence de paiement, produit, PDV et agence).";

/** Fiche définitive caution émise (caution payée). */
export function cautionEligibleCourrierComptabilite(numeroFicheDefinitive: string | null | undefined): boolean {
  return Boolean(numeroFicheDefinitive?.trim());
}

