export const LONACI_ROLES = [
  "AGENT",
  "CHEF_SECTION",
  "ASSIST_CDS",
  "CHEF_SERVICE",
  "SUPERVISEUR_REGIONAL",
  "AUDITEUR",
  "LECTURE_SEULE",
] as const;

export type LonaciRole = (typeof LONACI_ROLES)[number];

export const LONACI_ROLE_LABELS: Record<LonaciRole, string> = {
  AGENT: "Agent opérationnel",
  CHEF_SECTION: "Chef(fe) de section",
  ASSIST_CDS: "Assistant(e) chef(fe) de service",
  CHEF_SERVICE: "Chef(fe) de service",
  SUPERVISEUR_REGIONAL: "Superviseur régional",
  AUDITEUR: "Auditeur",
  LECTURE_SEULE: "Lecture seule",
};

export interface LonaciRoleProfile {
  designation: string;
  responsabilite: string;
}

export const LONACI_ROLE_PROFILES: Record<LonaciRole, LonaciRoleProfile> = {
  AGENT: {
    designation: "Agent opérationnel",
    responsabilite:
      "Action et saisie sur l’ensemble des modules métier (contrats, cautions, PDV, agréments, cessions, résiliations, attestations, décès, bancarisation, GPR, référentiel, notifications, etc.), dans la limite de son agence et des modules assignés au compte. Hors périmètre : production des rapports (lecture / suivi seulement selon les écrans) et gestion des comptes utilisateurs.",
  },
  CHEF_SECTION: {
    designation: "Chef(fe) de section",
    responsabilite:
      "Contrôle N1 — valide ou rejette les dossiers soumis par les agents. Produit les rapports hebdomadaires.",
  },
  ASSIST_CDS: {
    designation: "Assistant(e) chef(fe) de service",
    responsabilite:
      "Contrôle N2. Synthèse des états. Produit les rapports mensuels, semestriels et annuels.",
  },
  CHEF_SERVICE: {
    designation: "Chef(fe) de service",
    responsabilite:
      "Validation finale. Accès complet à tous les modules. Finalise tous les dossiers. Paramètre le système.",
  },
  SUPERVISEUR_REGIONAL: {
    designation: "Superviseur régional",
    responsabilite: "Supervision transverse. Consultation et pilotage inter-agences selon périmètre attribué.",
  },
  AUDITEUR: {
    designation: "Auditeur",
    responsabilite: "Contrôle et audit. Accès en lecture globale pour vérification de conformité.",
  },
  LECTURE_SEULE: {
    designation: "Lecture seule",
    responsabilite: "Consultation uniquement. Aucun droit de création, validation ou paramétrage.",
  },
};

export function getLonaciRoleLabel(role: string | null | undefined): string {
  if (!role) return "";
  if ((LONACI_ROLES as readonly string[]).includes(role)) {
    return LONACI_ROLE_LABELS[role as LonaciRole];
  }
  return role;
}

export function getLonaciRoleProfile(role: string | null | undefined): LonaciRoleProfile | null {
  if (!role) return null;
  if ((LONACI_ROLES as readonly string[]).includes(role)) {
    return LONACI_ROLE_PROFILES[role as LonaciRole];
  }
  return null;
}

export const DOSSIER_STATUSES = [
  "BROUILLON",
  "SOUMIS",
  "VALIDE_N1",
  "VALIDE_N2",
  "FINALISE",
  "REJETE",
] as const;

export type DossierStatus = (typeof DOSSIER_STATUSES)[number];

export const DOSSIER_TYPES = ["CONTRAT_ACTUALISATION"] as const;
export type DossierType = (typeof DOSSIER_TYPES)[number];

export const CONTRAT_OPERATION_TYPES = ["NOUVEAU", "ACTUALISATION"] as const;
export type ContratOperationType = (typeof CONTRAT_OPERATION_TYPES)[number];

export const CONTRAT_STATUSES = ["ACTIF", "RESILIE", "CEDE"] as const;
export type ContratStatus = (typeof CONTRAT_STATUSES)[number];

export const CAUTION_ENCAISSEMENT_MODES = [
  "ESPECES",
  "CHEQUE",
  "VIREMENT",
  "MOBILE_MONEY",
  "AUTRE",
] as const;
export type CautionEncaissementMode = (typeof CAUTION_ENCAISSEMENT_MODES)[number];

export const CAUTION_ENCAISSEMENT_MODE_LABELS: Record<CautionEncaissementMode, string> = {
  ESPECES: "Espèces",
  CHEQUE: "Chèque",
  VIREMENT: "Virement",
  MOBILE_MONEY: "Mobile money",
  AUTRE: "Autre",
};

export function getCautionEncaissementModeLabel(mode: string): string {
  if ((CAUTION_ENCAISSEMENT_MODES as readonly string[]).includes(mode)) {
    return CAUTION_ENCAISSEMENT_MODE_LABELS[mode as CautionEncaissementMode];
  }
  if (mode === "PAIEMENT_DIFFERE") {
    return "Paiement différé (fiche de paiement caution)";
  }
  return mode;
}

export const CAUTION_PAYMENT_MODES = [
  ...CAUTION_ENCAISSEMENT_MODES,
  /** Fiche provisoire : encaissement saisi ultérieurement (régularisation). */
  "PAIEMENT_DIFFERE",
] as const;
export type CautionPaymentMode = (typeof CAUTION_PAYMENT_MODES)[number];

/** Après saisie : pas de circuit N1/N2 ; finalisation paiement / rejet par le chef de service (hors fiche provisoire). */
export const CAUTION_STATUSES = ["EN_ATTENTE", "VALIDE_N1", "VALIDE_N2", "A_CORRIGER", "PAYEE", "ANNULEE"] as const;
export type CautionStatus = (typeof CAUTION_STATUSES)[number];

export const PDV_INTEGRATION_STATUSES = [
  "DEMANDE_RECUE",
  "EN_TRAITEMENT",
  "INTEGRE_GPR",
  "FINALISE",
] as const;
export type PdvIntegrationStatus = (typeof PDV_INTEGRATION_STATUSES)[number];

export const ATTESTATION_DOMICILIATION_TYPES = ["ATTESTATION_REVENU", "DOMICILIATION_PRODUIT"] as const;
export type AttestationDomiciliationType = (typeof ATTESTATION_DOMICILIATION_TYPES)[number];

export const ATTESTATION_DOMICILIATION_STATUSES = ["DEMANDE_RECUE", "TRANSMIS", "FINALISE"] as const;
export type AttestationDomiciliationStatus = (typeof ATTESTATION_DOMICILIATION_STATUSES)[number];

/** Statut métier concessionnaire / PDV (référentiel Sprint 2) */
export const CONCESSIONNAIRE_STATUTS = [
  "ACTIF",
  "SUSPENDU",
  "INACTIF",
  "RESILIE",
  "DECEDE",
  "SUCCESSION_EN_COURS",
] as const;

export type ConcessionnaireStatut = (typeof CONCESSIONNAIRE_STATUTS)[number];

/** Parcours d'inscription concessionnaire (avant accès opérationnel). */
export const CONCESSIONNAIRE_INSCRIPTION_STATUTS = [
  "BROUILLON",
  "SOUMIS",
  "VALIDE",
  "REJETE",
] as const;

export type ConcessionnaireInscriptionStatut = (typeof CONCESSIONNAIRE_INSCRIPTION_STATUTS)[number];

export const CONCESSIONNAIRE_INSCRIPTION_STATUT_LABELS: Record<
  ConcessionnaireInscriptionStatut,
  string
> = {
  BROUILLON: "Brouillon",
  SOUMIS: "Soumis (attente N1)",
  VALIDE: "Inscription validée",
  REJETE: "Inscription rejetée",
};

/** Libellés UI fiche concessionnaire */
export const CONCESSIONNAIRE_STATUT_LABELS: Record<ConcessionnaireStatut, string> = {
  ACTIF: "Actif",
  SUSPENDU: "Suspendu",
  INACTIF: "Inactif",
  RESILIE: "Résilié",
  DECEDE: "Décédé",
  SUCCESSION_EN_COURS: "Succession en cours",
};

export const BANCARISATION_STATUTS = [
  "NON_BANCARISE",
  "EN_COURS",
  "BANCARISE",
] as const;

export type BancarisationStatut = (typeof BANCARISATION_STATUTS)[number];

export const BANCARISATION_STATUT_LABELS: Record<BancarisationStatut, string> = {
  NON_BANCARISE: "Non bancarisé",
  EN_COURS: "En cours",
  BANCARISE: "Bancarisé",
};

/** Opérations interdites sauf lecture / notes service (règles MVP) */
export const CONCESSIONNAIRE_STATUTS_BLOQUANTS = ["INACTIF", "RESILIE", "DECEDE"] as const;

/** Décès et ayants droit — 5 étapes séquentielles (Sprint 5) */
export const SUCCESSION_STEPS = [
  "DECLARATION_DECES",
  "IDENTIFICATION_AYANT_DROIT",
  "PIECES_JUSTIFICATIVES",
  "VERIFICATION_JURIDIQUE",
  "DECISION",
] as const;

export type SuccessionStep = (typeof SUCCESSION_STEPS)[number];

export const SUCCESSION_CASE_STATUSES = ["OUVERT", "CLOTURE"] as const;
export type SuccessionCaseStatus = (typeof SUCCESSION_CASE_STATUSES)[number];

export const SUCCESSION_STEP_LABELS: Record<SuccessionStep, string> = {
  DECLARATION_DECES: "1. Déclaration de décès",
  IDENTIFICATION_AYANT_DROIT: "2. Ayant droit identifié",
  PIECES_JUSTIFICATIVES: "3. Documents collectés",
  VERIFICATION_JURIDIQUE: "4. Vérification juridique",
  DECISION: "5. Décision (transfert / résiliation)",
};
