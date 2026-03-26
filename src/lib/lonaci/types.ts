import type {
  LonaciRole,
  BancarisationStatut,
  ConcessionnaireStatut,
  ContratOperationType,
  ContratStatus,
  CautionPaymentMode,
  CautionStatus,
  DossierStatus,
  DossierType,
  PdvIntegrationStatus,
  SuccessionCaseStatus,
  SuccessionStep,
} from "@/lib/lonaci/constants";

export type {
  LonaciRole,
  BancarisationStatut,
  ConcessionnaireStatut,
  ContratOperationType,
  ContratStatus,
  CautionPaymentMode,
  CautionStatus,
  DossierStatus,
  DossierType,
  PdvIntegrationStatus,
  SuccessionCaseStatus,
  SuccessionStep,
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
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface AgenceDocument {
  _id?: string;
  code: string;
  libelle: string;
  actif: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProduitDocument {
  _id?: string;
  code: string;
  libelle: string;
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
  codePdv: string;
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
  compteBancaire: string | null;
  banqueEtablissement: string | null;
  gps: GpsPoint | null;
  piecesJointes: PieceJointeDocument[];
  observations: string | null;
  notesInternes: string | null;
  createdByUserId: string;
  updatedByUserId: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export type BancarisationRequestStatus = "SOUMIS" | "VALIDE" | "REJETE";

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
  concessionnaireId: string;
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
  concessionnaireId: string;
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
  contratId: string;
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
  paidAt: Date | null;
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
  stepHistory: SuccessionStepCompletion[];
  createdByUserId: string;
  updatedByUserId: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export type AuditEntityType = "CONCESSIONNAIRE" | "DOSSIER" | "CONTRAT" | "SUCCESSION";

export interface AuditLogDocument {
  entityType: AuditEntityType;
  entityId: string;
  action: string;
  userId: string;
  details: Record<string, unknown> | null;
  createdAt: Date;
}
