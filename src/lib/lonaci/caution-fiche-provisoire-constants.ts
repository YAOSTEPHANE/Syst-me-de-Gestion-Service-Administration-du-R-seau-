/** Libellés fiche provisoire caution (client + serveur). */
/** Titre aligné sur le formulaire officiel LONACI_DVGR_PR02_ENREG. */
export const CAUTION_FICHE_PROVISOIRE_TITLE = "FICHE CAUTION AGREMENT";
export const CAUTION_FICHE_EN_ATTENTE_MENTION = "EN ATTENTE DE PAIEMENT";
/** Agence de rattachement du client / concessionnaire à l'inscription. */
export const CAUTION_FICHE_AGENCE_INSCRIPTION_LABEL = "Agence d'affectation";
/** Référence qualité du formulaire papier LONACI. */
export const CAUTION_FICHE_ENREG_REFERENCE = "LONACI_DVGR_PR02_ENREG";
export const CAUTION_FICHE_ENREG_VERSION = "01";
export const CAUTION_FICHE_SIGNATURE_ROLE =
  "Chef de Section de l'Administration du réseau";

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

/** Titre dynamique : FICHE CAUTION AGREMENT PMU ALR… */
export function cautionFicheAgrementTitle(produitCodes: string[]): string {
  const codes = produitCodes
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
  if (codes.length === 0) return CAUTION_FICHE_PROVISOIRE_TITLE;
  return `${CAUTION_FICHE_PROVISOIRE_TITLE} ${codes.join(" ")}`;
}
