export const LONACI_ROLES = [
  "AGENT",
  "CHEF_SECTION",
  "ASSIST_CDS",
  "CHEF_SERVICE",
  "DISPATCHER",
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
  DISPATCHER: "Dispatcher codes grattage",
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
  DISPATCHER: {
    designation: "Dispatcher codes grattage",
    responsabilite:
      "Distribution et suivi des codes grattage : concessionnaires éligibles par produit, attribution en temps réel, tableau de bord (codes distribués, solde, alertes rupture). Accès dédié au module codes grattage.",
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

/**
 * Statuts techniques en base. Le statut affiché métier (spec 2.3) est calculé via
 * `resolveCautionStatutMetier` : EN_ATTENTE | PAYEE | EN_RETARD | EXONEREE.
 */
export const CAUTION_STATUSES = [
  "EN_ATTENTE",
  "VALIDE_N1",
  "VALIDE_N2",
  "A_CORRIGER",
  "PAYEE",
  "EXONEREE",
  "ANNULEE",
] as const;
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

export const ATTESTATION_DOMICILIATION_STATUSES = [
  "DEMANDE_RECUE",
  "TRANSMIS",
  "FINALISE",
  "VALIDE",
  "ENVOYE_CLIENT",
] as const;
export type AttestationDomiciliationStatus = (typeof ATTESTATION_DOMICILIATION_STATUSES)[number];

export const ATTESTATION_DOMICILIATION_TYPE_LABELS: Record<
  AttestationDomiciliationType,
  string
> = {
  ATTESTATION_REVENU: "Attestation de revenu",
  DOMICILIATION_PRODUIT: "Domiciliation produit",
};

/** Libellés spec 4.4 — statuts du traitement attestation. */
export const ATTESTATION_DOMICILIATION_STATUT_LABELS: Record<
  AttestationDomiciliationStatus,
  string
> = {
  DEMANDE_RECUE: "EN COURS",
  TRANSMIS: "TRANSMIS DFC",
  FINALISE: "FINALISÉ DFC",
  /** Code technique `VALIDE` — affichage métier « EN RÉVISION » (spec 4.4). */
  VALIDE: "EN RÉVISION",
  ENVOYE_CLIENT: "ENVOYÉ CLIENT",
};

/** Descriptions spec 4.4 — statuts du traitement attestation. */
export const ATTESTATION_DOMICILIATION_STATUT_DESCRIPTIONS: Record<
  AttestationDomiciliationStatus,
  string
> = {
  DEMANDE_RECUE: "Demande saisie par l'agent — En attente de transmission",
  TRANSMIS: "Dossier envoyé à la DFC par le Chef de Service",
  FINALISE: "Dossier traité et retourné par la DFC",
  VALIDE: "Chef de Service révise le dossier finalisé avant envoi",
  ENVOYE_CLIENT: "Attestation transmise au client par le Chef de Service",
};

/** Liste ordonnée spec 4.4 pour affichage (tableau de bord, aide). */
export const ATTESTATION_DOMICILIATION_STATUTS_SPEC_44 = ATTESTATION_DOMICILIATION_STATUSES.map(
  (statut) => ({
    statut,
    label: ATTESTATION_DOMICILIATION_STATUT_LABELS[statut],
    description: ATTESTATION_DOMICILIATION_STATUT_DESCRIPTIONS[statut],
  }),
);

export function getAttestationDomiciliationStatutLabel(statut: string): string {
  if ((ATTESTATION_DOMICILIATION_STATUSES as readonly string[]).includes(statut)) {
    return ATTESTATION_DOMICILIATION_STATUT_LABELS[statut as AttestationDomiciliationStatus];
  }
  return statut;
}

export function getAttestationDomiciliationStatutDescription(statut: string): string {
  if ((ATTESTATION_DOMICILIATION_STATUSES as readonly string[]).includes(statut)) {
    return ATTESTATION_DOMICILIATION_STATUT_DESCRIPTIONS[statut as AttestationDomiciliationStatus];
  }
  return "";
}

/** Spec 4.3 — circuit de traitement (étapes 11 à 16). */
export const ATTESTATION_CIRCUIT_ETAPES = [
  {
    step: 11,
    statut: "DEMANDE_RECUE" as const,
    label: "Soumission agent",
    description: "L'agent remplit et soumet la demande d'attestation dans le système.",
    roles: ["AGENT", "CHEF_SECTION"] as const,
  },
  {
    step: 12,
    statut: "TRANSMIS" as const,
    label: "Transmission DFC",
    description:
      "Le Chef de Service transmet le dossier à la DFC (Direction Financière et Comptable) via le système.",
    roles: ["CHEF_SERVICE"] as const,
  },
  {
    step: 13,
    statut: "FINALISE" as const,
    label: "Traitement DFC",
    description: "La DFC traite et finalise le dossier.",
    roles: ["ASSIST_CDS"] as const,
  },
  {
    step: 14,
    statut: "VALIDE" as const,
    label: "En révision",
    description: ATTESTATION_DOMICILIATION_STATUT_DESCRIPTIONS.VALIDE,
    roles: ["CHEF_SERVICE"] as const,
  },
  {
    step: 15,
    statut: "ENVOYE_CLIENT" as const,
    label: "Envoi client (SMTP)",
    description:
      "Le Chef de Service envoie l'attestation au client via le système (email SMTP).",
    roles: ["CHEF_SERVICE"] as const,
  },
  {
    step: 16,
    statut: "ENVOYE_CLIENT" as const,
    label: "Horodatage",
    description: "Le statut passe automatiquement à Envoyé client — horodaté.",
    roles: ["CHEF_SERVICE"] as const,
  },
] as const;

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
  "DOSSIER_EN_COURS",
  "SOUMIS",
  "VALIDE",
  "REJETE",
] as const;

export type ConcessionnaireInscriptionStatut = (typeof CONCESSIONNAIRE_INSCRIPTION_STATUTS)[number];

/** Ancien libellé technique conservé en lecture seule (données historiques). */
export const CONCESSIONNAIRE_INSCRIPTION_STATUT_LEGACY_BROUILLON = "BROUILLON";

export const CONCESSIONNAIRE_INSCRIPTION_STATUT_LABELS: Record<
  ConcessionnaireInscriptionStatut,
  string
> = {
  DOSSIER_EN_COURS: "Dossier en cours (avant paiement caution)",
  SOUMIS: "Soumis (attente N1)",
  VALIDE: "Inscription finalisée (caution payée)",
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

/** 8.3 — Statuts unifiés de la bancarisation (collecte RIB → intégration paiement) */
export const BANCARISATION_STATUTS = [
  "NON_BANCARISE",
  "EN_ATTENTE_RIB",
  "RIB_FOURNI",
  "RIB_VALIDE",
  "BANCARISE",
] as const;

export type BancarisationStatut = (typeof BANCARISATION_STATUTS)[number];

export const BANCARISATION_STATUT_LABELS: Record<BancarisationStatut, string> = {
  NON_BANCARISE: "NON BANCARISÉ",
  EN_ATTENTE_RIB: "EN ATTENTE DE RIB",
  RIB_FOURNI: "RIB FOURNI",
  RIB_VALIDE: "RIB VALIDÉ",
  BANCARISE: "BANCARISÉ",
};

export const BANCARISATION_STATUT_DESCRIPTIONS: Record<BancarisationStatut, string> = {
  NON_BANCARISE: "Pas de RIB fourni — Commissions non versables",
  EN_ATTENTE_RIB: "Demande envoyée — RIB non encore reçu",
  RIB_FOURNI: "Document reçu et attaché — En attente de validation",
  RIB_VALIDE: "RIB contrôlé et validé — Prêt pour intégration",
  BANCARISE: "RIB intégré — Commissions versées sur compte bancaire",
};

export const BANCARISATION_STATUTS_SPEC_83 = BANCARISATION_STATUTS.map((statut) => ({
  statut,
  label: BANCARISATION_STATUT_LABELS[statut],
  description: BANCARISATION_STATUT_DESCRIPTIONS[statut],
}));

/** Sous-ensemble RIB (phases 8.1) — alias des statuts 8.3 */
export const RIB_ETATS = ["EN_ATTENTE_RIB", "RIB_FOURNI", "RIB_VALIDE"] as const;

export type RibEtat = (typeof RIB_ETATS)[number];

export const RIB_ETAT_LABELS: Record<RibEtat, string> = {
  EN_ATTENTE_RIB: BANCARISATION_STATUT_LABELS.EN_ATTENTE_RIB,
  RIB_FOURNI: BANCARISATION_STATUT_LABELS.RIB_FOURNI,
  RIB_VALIDE: BANCARISATION_STATUT_LABELS.RIB_VALIDE,
};

export const RIB_ETATS_SPEC_81 = BANCARISATION_STATUTS_SPEC_83.filter((row) =>
  (RIB_ETATS as readonly string[]).includes(row.statut),
);

/** 8.2 — Intégration : RIB VALIDÉ → BANCARISÉ */
export const BANCARISATION_INTEGRATION_SPEC_82 = {
  fromStatut: "RIB_VALIDE" as const,
  toStatut: "BANCARISE" as const,
  label: BANCARISATION_STATUT_LABELS.BANCARISE,
  description: BANCARISATION_STATUT_DESCRIPTIONS.BANCARISE,
} as const;

/** §9.1 — Statuts lot / code grattage */
export const SCRATCH_CODE_STATUTS = ["GENERE", "ATTRIBUE", "ACTIF", "EPUISE"] as const;

export type ScratchCodeStatut = (typeof SCRATCH_CODE_STATUTS)[number];

export const SCRATCH_CODE_STATUT_LABELS: Record<ScratchCodeStatut, string> = {
  GENERE: "Généré",
  ATTRIBUE: "Attribué",
  ACTIF: "Actif",
  EPUISE: "Épuisé",
};

/** Seuil par défaut alerte rupture de stock (codes non attribués). */
export const GRATTAGE_STOCK_ALERT_DEFAULT = 50;

/** §9.3 — Statuts contrat grattage */
export const GRATTAGE_CONTRAT_STATUTS = ["EN_COURS", "SUSPENDU", "RESILIE", "EXPIRE"] as const;

export type GrattageContratStatut = (typeof GRATTAGE_CONTRAT_STATUTS)[number];

export const GRATTAGE_CONTRAT_STATUT_LABELS: Record<GrattageContratStatut, string> = {
  EN_COURS: "EN COURS",
  SUSPENDU: "SUSPENDU",
  RESILIE: "RÉSILIÉ",
  EXPIRE: "EXPIRÉ",
};

export const GRATTAGE_CONTRAT_STATUTS_SPEC_93 = GRATTAGE_CONTRAT_STATUTS.map((statut) => ({
  statut,
  label: GRATTAGE_CONTRAT_STATUT_LABELS[statut],
}));

/** Opérations interdites sauf lecture / notes service (règles MVP) */
export const CONCESSIONNAIRE_STATUTS_BLOQUANTS = ["INACTIF", "RESILIE", "DECEDE"] as const;

/** Décès et ayants droit — 5 étapes séquentielles (§10.2, étapes métier 17 à 21). */
export const SUCCESSION_STEPS = [
  "DECLARATION_DECES",
  "IDENTIFICATION_AYANT_DROIT",
  "PIECES_JUSTIFICATIVES",
  "VERIFICATION_JURIDIQUE",
  "DECISION",
] as const;

export type SuccessionStep = (typeof SUCCESSION_STEPS)[number];

/** Numéros métier affichés (spec §10.2). */
export const SUCCESSION_STEP_NUMBERS: Record<SuccessionStep, number> = {
  DECLARATION_DECES: 17,
  IDENTIFICATION_AYANT_DROIT: 18,
  PIECES_JUSTIFICATIVES: 19,
  VERIFICATION_JURIDIQUE: 20,
  DECISION: 21,
};

export const SUCCESSION_CASE_STATUSES = ["OUVERT", "CLOTURE"] as const;
export type SuccessionCaseStatus = (typeof SUCCESSION_CASE_STATUSES)[number];

export const SUCCESSION_STEP_LABELS: Record<SuccessionStep, string> = {
  DECLARATION_DECES: "17. Déclaration du décès",
  IDENTIFICATION_AYANT_DROIT: "18. Identification de l'ayant droit",
  PIECES_JUSTIFICATIVES: "19. Vérification documentaire",
  VERIFICATION_JURIDIQUE: "20. Vérification juridique OHADA",
  DECISION: "21. Décision finale",
};

/** Descriptions §10.2 pour aide contextuelle et stepper. */
export const SUCCESSION_STEP_DESCRIPTIONS: Record<SuccessionStep, string> = {
  DECLARATION_DECES: "Saisie par l'agent avec pièces initiales (acte de décès).",
  IDENTIFICATION_AYANT_DROIT: "Constitution du dossier de succession — ayant droit identifié.",
  PIECES_JUSTIFICATIVES: "Contrôle de la checklist §10.1 — validations N1 (chef de section) et N2 (assistant CDS).",
  VERIFICATION_JURIDIQUE: "Chef de service — validation de conformité OHADA.",
  DECISION: "Transfert du contrat à l'ayant droit ou résiliation du point de vente.",
};
