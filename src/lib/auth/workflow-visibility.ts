import type { LonaciRole } from "@/lib/lonaci/constants";

export const HIERARCHICAL_WORKFLOWS = [
  "DOSSIERS",
  "CAUTIONS",
  "AGREMENTS",
  "CESSIONS",
  "DELOCALISATIONS",
  "RESILIATIONS",
  "SUCCESSIONS",
  "BANCARISATION",
  "GPR",
] as const;

export type HierarchicalWorkflow = (typeof HIERARCHICAL_WORKFLOWS)[number];

export const SUCCESSION_VISIBILITY_STATES = [
  "EN_ATTENTE_N1",
  "EN_ATTENTE_N2",
  "EN_ATTENTE_FINALISATION",
  "FINALISE",
] as const;

export type SuccessionVisibilityState = (typeof SUCCESSION_VISIBILITY_STATES)[number];

type ValidatorRole = "CHEF_SECTION" | "ASSIST_CDS" | "CHEF_SERVICE";

interface WorkflowVisibilityPolicy {
  known: readonly string[];
  activeByRole: Readonly<Record<ValidatorRole, readonly string[]>>;
  finalized: readonly string[];
  rejected: readonly string[];
  correction: readonly string[];
}

const VALIDATOR_ROLES: readonly ValidatorRole[] = [
  "CHEF_SECTION",
  "ASSIST_CDS",
  "CHEF_SERVICE",
];

const POLICIES: Readonly<Record<Exclude<HierarchicalWorkflow, "SUCCESSIONS">, WorkflowVisibilityPolicy>> = {
  DOSSIERS: {
    known: ["BROUILLON", "SOUMIS", "VALIDE_N1", "VALIDE_N2", "FINALISE", "REJETE"],
    activeByRole: {
      CHEF_SECTION: ["SOUMIS"],
      ASSIST_CDS: ["VALIDE_N1"],
      CHEF_SERVICE: ["VALIDE_N2"],
    },
    finalized: ["FINALISE"],
    rejected: ["REJETE"],
    correction: [],
  },
  CAUTIONS: {
    known: ["EN_ATTENTE", "VALIDE_N1", "VALIDE_N2", "A_CORRIGER", "PAYEE", "EXONEREE", "ANNULEE"],
    activeByRole: {
      CHEF_SECTION: ["EN_ATTENTE"],
      ASSIST_CDS: ["VALIDE_N1"],
      CHEF_SERVICE: ["VALIDE_N2"],
    },
    finalized: ["PAYEE", "EXONEREE"],
    rejected: ["ANNULEE"],
    correction: ["A_CORRIGER"],
  },
  AGREMENTS: {
    known: ["RECU", "CONTROLE", "TRANSMIS", "FINALISE"],
    activeByRole: {
      CHEF_SECTION: ["RECU"],
      ASSIST_CDS: ["CONTROLE"],
      CHEF_SERVICE: ["TRANSMIS"],
    },
    finalized: ["FINALISE"],
    rejected: [],
    correction: [],
  },
  CESSIONS: {
    known: ["SAISIE_AGENT", "CONTROLE_CHEF_SECTION", "VALIDATION_N2", "VALIDEE_CHEF_SERVICE", "REJETEE"],
    activeByRole: {
      CHEF_SECTION: ["SAISIE_AGENT"],
      ASSIST_CDS: ["CONTROLE_CHEF_SECTION"],
      CHEF_SERVICE: ["VALIDATION_N2"],
    },
    finalized: ["VALIDEE_CHEF_SERVICE"],
    rejected: ["REJETEE"],
    correction: [],
  },
  DELOCALISATIONS: {
    known: ["SAISIE_AGENT", "CONTROLE_CHEF_SECTION", "VALIDATION_N2", "VALIDEE_CHEF_SERVICE", "REJETEE"],
    activeByRole: {
      CHEF_SECTION: ["SAISIE_AGENT"],
      ASSIST_CDS: [],
      CHEF_SERVICE: ["CONTROLE_CHEF_SECTION"],
    },
    finalized: ["VALIDEE_CHEF_SERVICE"],
    rejected: ["REJETEE"],
    correction: [],
  },
  RESILIATIONS: {
    known: ["DOSSIER_RECU", "CONTROLE_CHEF_SECTION", "VALIDATION_N2", "RESILIE", "REJETEE"],
    activeByRole: {
      CHEF_SECTION: ["DOSSIER_RECU"],
      ASSIST_CDS: ["CONTROLE_CHEF_SECTION"],
      CHEF_SERVICE: ["VALIDATION_N2"],
    },
    finalized: ["RESILIE"],
    rejected: ["REJETEE"],
    correction: [],
  },
  BANCARISATION: {
    known: ["SOUMIS", "VALIDE_N1", "VALIDE_N2", "VALIDE", "REJETE"],
    activeByRole: {
      CHEF_SECTION: ["SOUMIS"],
      ASSIST_CDS: ["VALIDE_N1"],
      CHEF_SERVICE: ["VALIDE_N2"],
    },
    finalized: ["VALIDE"],
    rejected: ["REJETE"],
    correction: [],
  },
  GPR: {
    known: ["SOUMIS_AGENT", "VALIDE_N1", "VALIDE_N2", "SUIVI_CHEF_SERVICE", "REJETE"],
    activeByRole: {
      CHEF_SECTION: ["SOUMIS_AGENT"],
      ASSIST_CDS: ["VALIDE_N1"],
      CHEF_SERVICE: ["VALIDE_N2"],
    },
    finalized: ["SUIVI_CHEF_SERVICE"],
    rejected: ["REJETE"],
    correction: [],
  },
};

export interface SuccessionVisibilitySource {
  status: string | null | undefined;
  validationN1At: Date | string | null | undefined;
  validationN2At: Date | string | null | undefined;
}

export function deriveSuccessionVisibilityState(
  source: SuccessionVisibilitySource,
): SuccessionVisibilityState | null {
  if (source.status === "CLOTURE") return "FINALISE";
  if (source.status !== "OUVERT") return null;
  if (source.validationN2At != null && source.validationN1At == null) return null;
  if (source.validationN2At != null) return "EN_ATTENTE_FINALISATION";
  if (source.validationN1At != null) return "EN_ATTENTE_N2";
  return "EN_ATTENTE_N1";
}

function isValidatorRole(role: LonaciRole): role is ValidatorRole {
  return (VALIDATOR_ROLES as readonly LonaciRole[]).includes(role);
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}

export function getVisibleSuccessionStates(role: LonaciRole): readonly SuccessionVisibilityState[] {
  switch (role) {
    case "CHEF_SECTION":
      return ["EN_ATTENTE_N1"];
    case "ASSIST_CDS":
      return ["EN_ATTENTE_N2"];
    case "CHEF_SERVICE":
      return ["EN_ATTENTE_FINALISATION", "FINALISE"];
    case "AUDITEUR":
      return ["FINALISE"];
    default:
      return [];
  }
}

export function isWorkflowStageAssignedToRole(input: {
  workflow: HierarchicalWorkflow;
  role: LonaciRole;
  status: string | null | undefined;
  successionState?: SuccessionVisibilityState | null;
}): boolean {
  if (!input.status) return false;
  if (input.workflow === "SUCCESSIONS") {
    if (!input.successionState || input.successionState === "FINALISE") return false;
    return getVisibleSuccessionStates(input.role).includes(input.successionState);
  }
  if (!isValidatorRole(input.role)) return false;
  return POLICIES[input.workflow].activeByRole[input.role].includes(input.status);
}

/**
 * Retourne uniquement les statuts bruts qui expriment exactement la politique.
 * Pour SUCCESSIONS, utiliser `getVisibleSuccessionStates` car `OUVERT` est ambigu.
 */
export function getVisibleWorkflowStatuses(
  workflow: HierarchicalWorkflow,
  role: LonaciRole,
): readonly string[] {
  if (workflow === "SUCCESSIONS") {
    return role === "CHEF_SERVICE" || role === "AUDITEUR" ? ["CLOTURE"] : [];
  }

  const policy = POLICIES[workflow];
  if (role === "AUDITEUR") return unique([...policy.finalized, ...policy.rejected]);
  if (!isValidatorRole(role)) return [];
  const active = policy.activeByRole[role];
  return role === "CHEF_SERVICE" ? unique([...active, ...policy.finalized]) : active;
}

export interface WorkflowDocumentVisibilityInput {
  workflow: HierarchicalWorkflow;
  role: LonaciRole;
  userId: string;
  creatorId: string | null | undefined;
  status: string | null | undefined;
  inCorrection?: boolean;
  successionState?: SuccessionVisibilityState | null;
}

export function isWorkflowDocumentVisible(input: WorkflowDocumentVisibilityInput): boolean {
  if (!input.status) return false;

  if (input.workflow === "SUCCESSIONS") {
    if (input.status !== "OUVERT" && input.status !== "CLOTURE") return false;
    if (!input.successionState) return false;
    if (input.status === "CLOTURE" && input.successionState !== "FINALISE") return false;
    if (input.status === "OUVERT" && input.successionState === "FINALISE") return false;
    if (input.userId.length > 0 && input.creatorId === input.userId) return true;
    if (input.inCorrection && isValidatorRole(input.role)) return false;
    return getVisibleSuccessionStates(input.role).includes(input.successionState);
  }

  const policy = POLICIES[input.workflow];
  if (!policy.known.includes(input.status)) return false;
  if (input.userId.length > 0 && input.creatorId === input.userId) return true;
  if ((input.inCorrection || policy.correction.includes(input.status)) && isValidatorRole(input.role)) {
    return false;
  }
  return getVisibleWorkflowStatuses(input.workflow, input.role).includes(input.status);
}

export type MongoSerializable =
  | string
  | number
  | boolean
  | null
  | MongoSerializable[]
  | { [key: string]: MongoSerializable };

export type WorkflowVisibilityMongoFilter = { [key: string]: MongoSerializable };

export interface WorkflowVisibilityMongoFilterInput {
  workflow: HierarchicalWorkflow;
  role: LonaciRole;
  userId: string;
  statusField?: string;
  creatorField?: string;
  correctionField?: string;
}

/**
 * Construit seulement la portion visibilité du filtre. Le scope agence doit être
 * composé séparément par les helpers d'autorisation existants.
 * Retourne `null` lorsque l'état métier n'est pas entièrement sérialisable.
 */
export function buildWorkflowVisibilityMongoFilter(
  input: WorkflowVisibilityMongoFilterInput,
): WorkflowVisibilityMongoFilter | null {
  const statusField = input.statusField ?? "status";
  const creatorField = input.creatorField ?? "createdByUserId";
  const creatorFilter: WorkflowVisibilityMongoFilter = {
    [creatorField]: input.userId.length > 0 ? input.userId : { $in: [] },
  };

  if (input.workflow === "SUCCESSIONS") {
    const n1Filter: WorkflowVisibilityMongoFilter = {
      [statusField]: "OUVERT",
      validationN1At: null,
      validationN2At: null,
    };
    const n2Filter: WorkflowVisibilityMongoFilter = {
      [statusField]: "OUVERT",
      validationN1At: { $ne: null },
      validationN2At: null,
    };
    const finalizationFilter: WorkflowVisibilityMongoFilter = {
      [statusField]: "OUVERT",
      validationN1At: { $ne: null },
      validationN2At: { $ne: null },
    };
    const finalizedFilter: WorkflowVisibilityMongoFilter = {
      [statusField]: "CLOTURE",
    };
    const validStateFilter: WorkflowVisibilityMongoFilter = {
      $or: [n1Filter, n2Filter, finalizationFilter, finalizedFilter],
    };
    const creatorStateFilter: WorkflowVisibilityMongoFilter = {
      $and: [creatorFilter, validStateFilter],
    };
    const roleStateFilters: WorkflowVisibilityMongoFilter[] = getVisibleSuccessionStates(
      input.role,
    ).map((state) => {
      switch (state) {
        case "EN_ATTENTE_N1":
          return n1Filter;
        case "EN_ATTENTE_N2":
          return n2Filter;
        case "EN_ATTENTE_FINALISATION":
          return finalizationFilter;
        case "FINALISE":
          return finalizedFilter;
        default: {
          const exhaustive: never = state;
          return exhaustive;
        }
      }
    });
    return roleStateFilters.length > 0
      ? { $or: [creatorStateFilter, ...roleStateFilters] }
      : creatorStateFilter;
  }

  const policy = POLICIES[input.workflow];
  const knownCreatorFilter: WorkflowVisibilityMongoFilter = {
    $and: [creatorFilter, { [statusField]: { $in: [...policy.known] } }],
  };
  const visibleStatuses = getVisibleWorkflowStatuses(input.workflow, input.role);
  if (visibleStatuses.length === 0) return knownCreatorFilter;

  const roleFilter: WorkflowVisibilityMongoFilter = {
    [statusField]: { $in: [...visibleStatuses] },
  };
  if (input.correctionField && isValidatorRole(input.role)) {
    roleFilter[input.correctionField] = { $ne: true };
  }

  return { $or: [knownCreatorFilter, roleFilter] };
}
