import type {
  LonaciRole,
  BancarisationStatut,
  ConcessionnaireInscriptionStatut,
  ConcessionnaireStatut,
  ContratOperationType,
  ContratStatus,
  CautionEncaissementMode,
  CautionPaymentMode,
  CautionStatus,
  DossierStatus,
  DossierType,
  PdvIntegrationStatus,
  SuccessionCaseStatus,
  SuccessionStep,
  RibEtat,
} from "@/lib/lonaci/constants";

export type {
  LonaciRole,
  BancarisationStatut,
  ConcessionnaireInscriptionStatut,
  ConcessionnaireStatut,
  ContratOperationType,
  ContratStatus,
  CautionEncaissementMode,
  CautionPaymentMode,
  CautionStatus,
  DossierStatus,
  DossierType,
  PdvIntegrationStatus,
  SuccessionCaseStatus,
  SuccessionStep,
  RibEtat,
};

export type UserStatus = "ACTIF" | "INACTIF";

export interface UserDocument {
  _id?: string;
  email: string;
  matricule: string | null;
  passwordHash: string;
  nom: string;
  prenom: string;
  role: LonaciRole;
  agenceId: string | null;
  agencesAutorisees: string[];
  modulesAutorises: string[];
  produitsAutorises: string[];
  actif: boolean;
  currentSessionId: string | null;
  derniereConnexion: Date | null;
  lastActivityAt: Date | null;
  resetPasswordTokenHash: string | null;
  resetPasswordExpiresAt: Date | null;
  /** Dernier enregistrement d’un nouveau mot de passe (rotation mensuelle). */
  passwordChangedAt: Date | null;
  /** Dernier `YYYY-MM` UTC pour lequel un e-mail automatique fin de mois (lien reset) a été envoyé. */
  passwordResetReminderSentForMonth: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

/** Libellé acteur pour messages / audits (pas de `nomComplet` en base utilisateur). */
export function userDisplayName(user: Pick<UserDocument, "prenom" | "nom" | "email" | "matricule">): string {
  const full = `${user.prenom} ${user.nom}`.trim();
  if (full) return full;
  const email = user.email.trim();
  if (email) return email;
  const m = user.matricule?.trim();
  if (m) return m;
  return "un utilisateur";
}

/** Rattachement géographique pour ventilation (matrices contrats, etc.). */
export type AgenceZoneGeographique = "ABIDJAN" | "INTERIEUR";

export interface AgenceDocument {
  _id?: string;
  code: string;
  libelle: string;
  /** Toujours défini après lecture (`listAgences` / `findAgenceById`) via `coalesceZoneGeographique`. */
  zoneGeographique: AgenceZoneGeographique;
  actif: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProduitDocumentChecklistItem {
  id: string;
  libelle: string;
  /** Défaut : obligatoire. */
  obligatoire?: boolean;
}

export type DossierDocumentChecklistStatut = "FOURNI" | "MANQUANT" | "EN_ATTENTE";

export interface DossierDocumentChecklistEntry {
  itemId: string;
  libelle: string;
  obligatoire: boolean;
  statut: DossierDocumentChecklistStatut;
}

export interface DossierDocumentChecklistPayload {
  entries: DossierDocumentChecklistEntry[];
  complet: boolean;
}

export interface ProduitDocument {
  _id?: string;
  code: string;
  libelle: string;
  /** Prix caution référentiel (FCFA), entier. */
  prix?: number;
  /** Documents obligatoires configurés pour la constitution de dossier. */
  documentsChecklist?: ProduitDocumentChecklistItem[];
  actif: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthLogDocument {
  email: string;
  userId: string | null;
  status: "SUCCESS" | "FAILED";
  ipAddress: string | null;
  userAgent: string | null;
  attemptedAt: Date;
  reason?: string;
}

export type PieceJointeKind = "PHOTO" | "DOCUMENT";

export interface PieceJointeDocument {
  id: string;
  kind: PieceJointeKind;
  filename: string;
  storedRelativePath: string;
  mimeType: string;
  size: number;
  uploadedAt: Date;
  uploadedByUserId: string;
}

export interface GpsPoint {
  lat: number;
  lng: number;
}

export interface ConcessionnaireDocument {
  _id?: string;
  codePdv: string | null;
  inscriptionStatut: ConcessionnaireInscriptionStatut;
  nom: string | null;
  prenom: string | null;
  codeTerminal: string | null;
  codeConcessionnaire: string | null;
  nomComplet: string;
  raisonSociale: string;
  cniNumero: string | null;
  photoUrl: string | null;
  email: string | null;
  telephonePrincipal: string | null;
  telephoneSecondaire: string | null;
  telephone: string | null;
  adresse: string | null;
  ville: string | null;
  codePostal: string | null;
  agenceId: string | null;
  produitsAutorises: string[];
  statut: ConcessionnaireStatut;
  statutBancarisation: BancarisationStatut;
  etatRib: RibEtat | null;
  ribDemandeAt: Date | null;
  ribFourniAt: Date | null;
  ribValideAt: Date | null;
  bancariseAt: Date | null;
  ribPieceId: string | null;
  compteBancaire: string | null;
  banqueEtablissement: string | null;
  gps: GpsPoint | null;
  documentChecklist: DossierDocumentChecklistPayload | null;
  inscriptionSoumisAt: Date | null;
  inscriptionValideN1At: Date | null;
  inscriptionRejetMotif: string | null;
  piecesJointes: PieceJointeDocument[];
  observations: string | null;
  notesInternes: string | null;
  createdByUserId: string;
  updatedByUserId: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

/** Demande : SOUMIS → VALIDE_N1 → VALIDE_N2 → VALIDE (application) | REJETE */
export type BancarisationRequestStatus = "SOUMIS" | "VALIDE_N1" | "VALIDE_N2" | "VALIDE" | "REJETE";

export interface BancarisationRequestDocument {
  _id?: string;
  concessionnaireId: string;
  agenceId: string | null;
  produitCode: string | null;
  statutActuel: BancarisationStatut;
  nouveauStatut: BancarisationStatut;
  compteBancaire: string | null;
  banqueEtablissement: string | null;
  dateEffet: Date;
  justificatif: {
    pieceId: string;
    filename: string;
    mimeType: string;
    size: number;
    url: string;
  };
  status: BancarisationRequestStatus;
  validationComment: string | null;
  validatedByUserId: string | null;
  validatedAt: Date | null;
  createdByUserId: string;
  updatedByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DossierValidationStep {
  status: DossierStatus;
  actedByUserId: string;
  actedAt: Date;
  comment: string | null;
}

export interface DossierDocument {
  _id?: string;
  type: DossierType;
  reference: string;
  status: DossierStatus;
  concessionnaireId: string | null;
  lonaciClientId?: string | null;
  agenceId: string | null;
  payload: Record<string, unknown>;
  history: DossierValidationStep[];
  createdByUserId: string;
  updatedByUserId: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface ContratDocument {
  _id?: string;
  reference: string;
  concessionnaireId: string | null;
  lonaciClientId?: string | null;
  produitCode: string;
  operationType: ContratOperationType;
  status: ContratStatus;
  dateEffet: Date;
  dossierId: string;
  createdByUserId: string;
  updatedByUserId: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface NotificationDocument {
  _id?: string;
  userId: string | null;
  roleTarget: LonaciRole | null;
  title: string;
  message: string;
  channel: "IN_APP" | "EMAIL";
  readAt: Date | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export interface CautionDocument {
  _id?: string;
  /**
   * Contrat PDV (historique) — absent pour une caution rattachée uniquement à un client Lonaci (module Clients).
   */
  contratId?: string;
  /** Client Lonaci (`clients`) lorsque la caution est constituée sans contrat. */
  lonaciClientId?: string | null;
  /** Concessionnaire PDV en attente de caution d'inscription (après validation N1). */
  concessionnaireId?: string | null;
  /** Code produit référentiel (obligatoire si `lonaciClientId`). */
  produitCode?: string | null;
  montant: number;
  modeReglement: CautionPaymentMode;
  status: CautionStatus;
  /**
   * Référence du paiement fournie lors de la saisie.
   * (Ex: numéro de transaction, chèque, mobile money, etc.)
   */
  paymentReference: string;
  dueDate: Date;
  /** Zone observations libre (optionnel). */
  observations: string | null;
  /** True tant que le paiement réel n’a pas été régularisé (fiche provisoire). */
  ficheProvisoire?: boolean;
  /** Numéro document fiche provisoire (ex. FPC-2026-000001), conservé après régularisation. */
  numeroFicheProvisoire?: string | null;
  /** Numéro fiche définitive (ex. FPD-2026-000001), émis à la validation du paiement. */
  numeroFicheDefinitive?: string | null;
  /** Date d’émission de la fiche définitive. */
  ficheDefinitiveEmiseLe?: Date | null;
  paidAt: Date | null;
  /** Première alerte automatique J+10 émise (statut métier EN RETARD). */
  j10AlertSentAt?: Date | null;
  immutableAfterFinal: boolean;
  createdByUserId: string;
  updatedByUserId: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface PdvIntegrationDocument {
  _id?: string;
  reference: string;
  codePdv: string;
  concessionnaireId: string | null;
  raisonSociale: string;
  agenceId: string | null;
  produitCode: string;
  nombreDemandes: number;
  dateDemande: Date;
  gps: GpsPoint;
  observations: string | null;
  status: PdvIntegrationStatus;
  finalizedAt: Date | null;
  createdByUserId: string;
  updatedByUserId: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface SuccessionStepCompletion {
  step: SuccessionStep;
  completedAt: Date;
  completedByUserId: string;
  comment: string | null;
}

export interface SuccessionCaseDocument {
  _id?: string;
  reference: string;
  concessionnaireId: string;
  agenceId: string | null;
  status: SuccessionCaseStatus;
  dateDeces: Date | null;
  acteDeces: {
    filename: string;
    mimeType: string;
    size: number;
    storedRelativePath: string;
    uploadedAt: Date;
    uploadedByUserId: string;
  } | null;
  ayantDroitNom: string | null;
  ayantDroitLienParente: string | null;
  ayantDroitTelephone: string | null;
  ayantDroitEmail: string | null;
  /** §10.1 — Checklist documentaire décès / ayants droit */
  documentChecklist?: DossierDocumentChecklistPayload | null;
  documents: Array<{
    id: string;
    filename: string;
    mimeType: string;
    size: number;
    storedRelativePath: string;
    uploadedAt: Date;
    uploadedByUserId: string;
  }>;
  decision: {
    type: "TRANSFERT" | "RESILIATION";
    decidedAt: Date;
    decidedByUserId: string;
    comment: string | null;
    autoDossierContratId?: string;
    autoDossierContratReference?: string;
  } | null;
  /** Contrôles N1 / N2 obligatoires avant l’étape « Décision ». */
  validationN1At: Date | null;
  validationN1ByUserId: string | null;
  validationN2At: Date | null;
  validationN2ByUserId: string | null;
  stepHistory: SuccessionStepCompletion[];
  createdByUserId: string;
  updatedByUserId: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  /** Dernière notification « sans action 30 j. » (réinitialisée à chaque activité métier). */
  staleAlertSentAt?: Date | null;
}

export type AuditEntityType = "CLIENT" | "CONCESSIONNAIRE" | "DOSSIER" | "CONTRAT" | "SUCCESSION";

export interface AuditLogDocument {
  entityType: AuditEntityType;
  entityId: string;
  action: string;
  userId: string;
  details: Record<string, unknown> | null;
  createdAt: Date;
}
