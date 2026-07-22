import {
  getVisibleWorkflowStatuses,
  isWorkflowStageAssignedToRole,
  type HierarchicalWorkflow,
} from "@/lib/auth/workflow-visibility";
import { LONACI_ROLES, type LonaciRole } from "@/lib/lonaci/constants";
import {
  areWorkflowApprovalsEnabled,
  isOperationalWorkflowRole,
  workflowAdvanceLabel,
} from "@/lib/lonaci/workflow-approvals";

export { workflowAdvanceLabel } from "@/lib/lonaci/workflow-approvals";

const NEXT_STATUS: Readonly<
  Partial<Record<HierarchicalWorkflow, Readonly<Record<string, string>>>>
> = {
  DOSSIERS: {
    BROUILLON: "SOUMIS",
    SOUMIS: "VALIDE_N1",
    VALIDE_N1: "VALIDE_N2",
    VALIDE_N2: "FINALISE",
  },
  CAUTIONS: {
    EN_ATTENTE: "VALIDE_N1",
    VALIDE_N1: "VALIDE_N2",
    VALIDE_N2: "PAYEE",
  },
  AGREMENTS: {
    RECU: "CONTROLE",
    CONTROLE: "TRANSMIS",
    TRANSMIS: "FINALISE",
  },
  CESSIONS: {
    SAISIE_AGENT: "CONTROLE_CHEF_SECTION",
    CONTROLE_CHEF_SECTION: "VALIDATION_N2",
    VALIDATION_N2: "VALIDEE_CHEF_SERVICE",
  },
  DELOCALISATIONS: {
    SAISIE_AGENT: "CONTROLE_CHEF_SECTION",
    CONTROLE_CHEF_SECTION: "VALIDEE_CHEF_SERVICE",
  },
  RESILIATIONS: {
    DOSSIER_RECU: "CONTROLE_CHEF_SECTION",
    CONTROLE_CHEF_SECTION: "VALIDATION_N2",
    VALIDATION_N2: "RESILIE",
  },
  BANCARISATION: {
    SOUMIS: "VALIDE_N1",
    VALIDE_N1: "VALIDE_N2",
    VALIDE_N2: "VALIDE",
  },
  GPR: {
    SOUMIS_AGENT: "VALIDE_N1",
    VALIDE_N1: "VALIDE_N2",
    VALIDE_N2: "SUIVI_CHEF_SERVICE",
  },
};

export function parseLonaciRole(value: string | null | undefined): LonaciRole | null {
  if (!value) return null;
  return LONACI_ROLES.includes(value as LonaciRole) ? (value as LonaciRole) : null;
}

export function getAssignedWorkflowTarget(input: {
  workflow: Exclude<HierarchicalWorkflow, "SUCCESSIONS">;
  role: LonaciRole | null;
  status: string;
}): string | null {
  if (!input.role) return null;
  if (
    !areWorkflowApprovalsEnabled() &&
    isOperationalWorkflowRole(input.role)
  ) {
    return NEXT_STATUS[input.workflow]?.[input.status] ?? null;
  }
  if (
    !isWorkflowStageAssignedToRole({
      workflow: input.workflow,
      role: input.role,
      status: input.status,
    })
  ) {
    return null;
  }
  return NEXT_STATUS[input.workflow]?.[input.status] ?? null;
}

export function workflowActionLabelForTarget(target: string | null | undefined): string {
  if (!areWorkflowApprovalsEnabled()) return workflowAdvanceLabel();
  if (!target) return workflowAdvanceLabel();
  if (target.includes("N1") || target === "CONTROLE_CHEF_SECTION" || target === "CONTROLE") {
    return "Valider N1";
  }
  if (target.includes("N2") || target === "VALIDATION_N2" || target === "TRANSMIS") {
    return "Valider N2";
  }
  if (
    target === "FINALISE" ||
    target === "VALIDEE_CHEF_SERVICE" ||
    target === "RESILIE" ||
    target === "PAYEE" ||
    target === "VALIDE" ||
    target === "SUIVI_CHEF_SERVICE"
  ) {
    return "Finaliser";
  }
  return workflowAdvanceLabel();
}

export function getRoleWorkflowFilterStatuses(
  workflow: HierarchicalWorkflow,
  role: LonaciRole | null,
): readonly string[] {
  if (!role) return [];
  return getVisibleWorkflowStatuses(workflow, role);
}

export function roleHasWorkflowQueue(role: LonaciRole | null): boolean {
  return (
    role === "AGENT" ||
    role === "CHEF_SECTION" ||
    role === "ASSIST_CDS" ||
    role === "CHEF_SERVICE" ||
    role === "AUDITEUR"
  );
}

export function canShowScratchLotTransition(
  role: LonaciRole | null,
  from: "GENERE" | "ATTRIBUE" | "ACTIF" | "EPUISE",
  to: "ATTRIBUE" | "ACTIF" | "EPUISE",
): boolean {
  if (!role) return false;
  if (from === "GENERE" && to === "ATTRIBUE") {
    return ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE", "DISPATCHER"].includes(role);
  }
  if (from === "ATTRIBUE" && to === "ACTIF") return role === "CHEF_SECTION";
  if (from === "ACTIF" && to === "EPUISE") {
    return ["CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"].includes(role);
  }
  return false;
}
