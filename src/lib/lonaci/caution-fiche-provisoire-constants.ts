/** Libellés fiche provisoire caution (client + serveur). */
export const CAUTION_FICHE_PROVISOIRE_TITLE = "FICHE PROVISOIRE DE PAIEMENT DE CAUTION";
export const CAUTION_FICHE_EN_ATTENTE_MENTION = "EN ATTENTE DE PAIEMENT";
/** Agence de rattachement du client / concessionnaire à l'inscription. */
export const CAUTION_FICHE_AGENCE_INSCRIPTION_LABEL = "Agence d'inscription";

export interface LonaciCautionBankReferences {
  banque: string;
  compte: string;
  iban: string | null;
  libelleVirement: string;
}

export function getLonaciCautionBankReferences(): LonaciCautionBankReferences {
  const banque = process.env.LONACI_CAUTION_BANK_NAME?.trim() || "Banque partenaire LONACI";
  const compte = process.env.LONACI_CAUTION_BANK_ACCOUNT?.trim() || "À confirmer auprès de la trésorerie LONACI";
  const iban = process.env.LONACI_CAUTION_BANK_IBAN?.trim() || null;
  const libelleVirement =
    process.env.LONACI_CAUTION_BANK_TRANSFER_LABEL?.trim() || "CAUTION CONCESSIONNAIRE — référence dossier obligatoire";
  return { banque, compte, iban, libelleVirement };
}
