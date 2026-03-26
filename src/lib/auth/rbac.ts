import type { LonaciRole } from "@/lib/lonaci/constants";

export const RBAC_RESOURCES = [
  "CONCESSIONNAIRES",
  "CONTRATS",
  "DOSSIERS",
  "CAUTIONS",
  "PDV_INTEGRATIONS",
  "AGREMENTS",
  "REPORTS",
  "ALERTS",
  "NOTIFICATIONS",
  "PARAMETRES",
] as const;

export type RbacResource = (typeof RBAC_RESOURCES)[number];

export const RBAC_ACTIONS = [
  "CREATE",
  "READ",
  "UPDATE",
  "DEACTIVATE",
  "VALIDATE_N1",
  "VALIDATE_N2",
  "REJECT",
  "RETURN_FOR_CORRECTION",
  "FINALIZE",
  "EXPORT",
  "CONFIGURE",
] as const;

export type RbacAction = (typeof RBAC_ACTIONS)[number];

export type ScopeRule = "GLOBAL" | "AGENCE" | "AGENCE_OR_ASSIGNED" | "OWN_OR_ASSIGNED";

export interface PermissionRule {
  resource: RbacResource;
  action: RbacAction;
  allowed: boolean;
  scope?: ScopeRule;
  notes?: string;
}

type RoleMatrix = Record<LonaciRole, PermissionRule[]>;

/**
 * Matrice RBAC centralisee.
 * - Les regles sont appliquees par role (jamais par individu).
 * - Les portees "AGENCE*" signifient limitation au perimetre agence de l'utilisateur.
 */
export const RBAC_MATRIX: RoleMatrix = {
  AGENT: [
    { resource: "CONCESSIONNAIRES", action: "CREATE", allowed: true, scope: "AGENCE_OR_ASSIGNED" },
    { resource: "CONCESSIONNAIRES", action: "READ", allowed: true, scope: "AGENCE_OR_ASSIGNED" },
    { resource: "CONCESSIONNAIRES", action: "UPDATE", allowed: true, scope: "AGENCE_OR_ASSIGNED" },
    { resource: "CONCESSIONNAIRES", action: "DEACTIVATE", allowed: false },

    { resource: "CONTRATS", action: "CREATE", allowed: true, scope: "AGENCE_OR_ASSIGNED" },
    { resource: "CONTRATS", action: "READ", allowed: true, scope: "AGENCE_OR_ASSIGNED" },
    { resource: "CONTRATS", action: "UPDATE", allowed: true, scope: "AGENCE_OR_ASSIGNED" },
    { resource: "CONTRATS", action: "FINALIZE", allowed: false },

    { resource: "DOSSIERS", action: "CREATE", allowed: true, scope: "AGENCE_OR_ASSIGNED" },
    { resource: "DOSSIERS", action: "READ", allowed: true, scope: "AGENCE_OR_ASSIGNED" },
    { resource: "DOSSIERS", action: "UPDATE", allowed: true, scope: "AGENCE_OR_ASSIGNED" },
    { resource: "DOSSIERS", action: "VALIDATE_N1", allowed: false },
    { resource: "DOSSIERS", action: "VALIDATE_N2", allowed: false },
    { resource: "DOSSIERS", action: "FINALIZE", allowed: false },
    { resource: "DOSSIERS", action: "REJECT", allowed: false },
    { resource: "DOSSIERS", action: "RETURN_FOR_CORRECTION", allowed: false },

    { resource: "CAUTIONS", action: "CREATE", allowed: true, scope: "AGENCE_OR_ASSIGNED" },
    { resource: "CAUTIONS", action: "READ", allowed: true, scope: "AGENCE_OR_ASSIGNED" },
    { resource: "CAUTIONS", action: "FINALIZE", allowed: false },

    { resource: "PDV_INTEGRATIONS", action: "CREATE", allowed: true, scope: "AGENCE_OR_ASSIGNED" },
    { resource: "PDV_INTEGRATIONS", action: "READ", allowed: true, scope: "AGENCE_OR_ASSIGNED" },
    { resource: "PDV_INTEGRATIONS", action: "UPDATE", allowed: true, scope: "AGENCE_OR_ASSIGNED" },
    { resource: "PDV_INTEGRATIONS", action: "FINALIZE", allowed: false },

    { resource: "AGREMENTS", action: "CREATE", allowed: true, scope: "AGENCE_OR_ASSIGNED" },
    { resource: "AGREMENTS", action: "READ", allowed: true, scope: "AGENCE_OR_ASSIGNED" },
    { resource: "AGREMENTS", action: "VALIDATE_N1", allowed: false },
    { resource: "AGREMENTS", action: "VALIDATE_N2", allowed: false },
    { resource: "AGREMENTS", action: "FINALIZE", allowed: false },

    { resource: "REPORTS", action: "READ", allowed: true, scope: "AGENCE_OR_ASSIGNED" },
    { resource: "REPORTS", action: "EXPORT", allowed: true, scope: "AGENCE_OR_ASSIGNED" },
    { resource: "REPORTS", action: "CONFIGURE", allowed: false },

    { resource: "ALERTS", action: "READ", allowed: true, scope: "AGENCE_OR_ASSIGNED" },
    { resource: "NOTIFICATIONS", action: "READ", allowed: true, scope: "OWN_OR_ASSIGNED" },
    { resource: "NOTIFICATIONS", action: "UPDATE", allowed: true, scope: "OWN_OR_ASSIGNED" },

    { resource: "PARAMETRES", action: "CONFIGURE", allowed: false },
  ],

  CHEF_SECTION: [
    { resource: "CONCESSIONNAIRES", action: "CREATE", allowed: true, scope: "AGENCE_OR_ASSIGNED" },
    { resource: "CONCESSIONNAIRES", action: "READ", allowed: true, scope: "AGENCE_OR_ASSIGNED" },
    { resource: "CONCESSIONNAIRES", action: "UPDATE", allowed: true, scope: "AGENCE_OR_ASSIGNED" },
    { resource: "CONCESSIONNAIRES", action: "DEACTIVATE", allowed: false },

    { resource: "CONTRATS", action: "CREATE", allowed: true, scope: "AGENCE_OR_ASSIGNED" },
    { resource: "CONTRATS", action: "READ", allowed: true, scope: "AGENCE_OR_ASSIGNED" },
    { resource: "CONTRATS", action: "UPDATE", allowed: true, scope: "AGENCE_OR_ASSIGNED" },
    { resource: "CONTRATS", action: "FINALIZE", allowed: false },

    { resource: "DOSSIERS", action: "READ", allowed: true, scope: "AGENCE_OR_ASSIGNED" },
    { resource: "DOSSIERS", action: "VALIDATE_N1", allowed: true, scope: "AGENCE_OR_ASSIGNED" },
    { resource: "DOSSIERS", action: "VALIDATE_N2", allowed: false },
    { resource: "DOSSIERS", action: "FINALIZE", allowed: false },
    { resource: "DOSSIERS", action: "REJECT", allowed: true, scope: "AGENCE_OR_ASSIGNED" },
    { resource: "DOSSIERS", action: "RETURN_FOR_CORRECTION", allowed: true, scope: "AGENCE_OR_ASSIGNED" },

    { resource: "CAUTIONS", action: "CREATE", allowed: true, scope: "AGENCE_OR_ASSIGNED" },
    { resource: "CAUTIONS", action: "READ", allowed: true, scope: "AGENCE_OR_ASSIGNED" },
    { resource: "CAUTIONS", action: "FINALIZE", allowed: false },

    { resource: "PDV_INTEGRATIONS", action: "CREATE", allowed: true, scope: "AGENCE_OR_ASSIGNED" },
    { resource: "PDV_INTEGRATIONS", action: "READ", allowed: true, scope: "AGENCE_OR_ASSIGNED" },
    { resource: "PDV_INTEGRATIONS", action: "UPDATE", allowed: true, scope: "AGENCE_OR_ASSIGNED" },
    { resource: "PDV_INTEGRATIONS", action: "FINALIZE", allowed: false },

    { resource: "AGREMENTS", action: "CREATE", allowed: true, scope: "AGENCE_OR_ASSIGNED" },
    { resource: "AGREMENTS", action: "READ", allowed: true, scope: "AGENCE_OR_ASSIGNED" },
    { resource: "AGREMENTS", action: "VALIDATE_N1", allowed: true, scope: "AGENCE_OR_ASSIGNED" },
    { resource: "AGREMENTS", action: "VALIDATE_N2", allowed: false },
    { resource: "AGREMENTS", action: "FINALIZE", allowed: false },

    { resource: "REPORTS", action: "READ", allowed: true, scope: "AGENCE_OR_ASSIGNED" },
    { resource: "REPORTS", action: "EXPORT", allowed: true, scope: "AGENCE_OR_ASSIGNED" },

    { resource: "ALERTS", action: "READ", allowed: true, scope: "AGENCE_OR_ASSIGNED" },
    { resource: "NOTIFICATIONS", action: "READ", allowed: true, scope: "OWN_OR_ASSIGNED" },
    { resource: "NOTIFICATIONS", action: "UPDATE", allowed: true, scope: "OWN_OR_ASSIGNED" },

    { resource: "PARAMETRES", action: "CONFIGURE", allowed: false },
  ],

  ASSIST_CDS: [
    { resource: "CONCESSIONNAIRES", action: "CREATE", allowed: true, scope: "AGENCE_OR_ASSIGNED" },
    { resource: "CONCESSIONNAIRES", action: "READ", allowed: true, scope: "AGENCE_OR_ASSIGNED" },
    { resource: "CONCESSIONNAIRES", action: "UPDATE", allowed: true, scope: "AGENCE_OR_ASSIGNED" },
    { resource: "CONCESSIONNAIRES", action: "DEACTIVATE", allowed: true, scope: "AGENCE_OR_ASSIGNED" },

    { resource: "CONTRATS", action: "CREATE", allowed: true, scope: "AGENCE_OR_ASSIGNED" },
    { resource: "CONTRATS", action: "READ", allowed: true, scope: "AGENCE_OR_ASSIGNED" },
    { resource: "CONTRATS", action: "UPDATE", allowed: true, scope: "AGENCE_OR_ASSIGNED" },
    { resource: "CONTRATS", action: "FINALIZE", allowed: false },

    { resource: "DOSSIERS", action: "READ", allowed: true, scope: "AGENCE_OR_ASSIGNED" },
    { resource: "DOSSIERS", action: "VALIDATE_N1", allowed: false },
    { resource: "DOSSIERS", action: "VALIDATE_N2", allowed: true, scope: "AGENCE_OR_ASSIGNED" },
    { resource: "DOSSIERS", action: "FINALIZE", allowed: false },
    { resource: "DOSSIERS", action: "REJECT", allowed: true, scope: "AGENCE_OR_ASSIGNED" },
    { resource: "DOSSIERS", action: "RETURN_FOR_CORRECTION", allowed: true, scope: "AGENCE_OR_ASSIGNED" },

    { resource: "CAUTIONS", action: "CREATE", allowed: true, scope: "AGENCE_OR_ASSIGNED" },
    { resource: "CAUTIONS", action: "READ", allowed: true, scope: "AGENCE_OR_ASSIGNED" },
    { resource: "CAUTIONS", action: "FINALIZE", allowed: false },

    { resource: "PDV_INTEGRATIONS", action: "CREATE", allowed: true, scope: "AGENCE_OR_ASSIGNED" },
    { resource: "PDV_INTEGRATIONS", action: "READ", allowed: true, scope: "AGENCE_OR_ASSIGNED" },
    { resource: "PDV_INTEGRATIONS", action: "UPDATE", allowed: true, scope: "AGENCE_OR_ASSIGNED" },
    { resource: "PDV_INTEGRATIONS", action: "FINALIZE", allowed: false },

    { resource: "AGREMENTS", action: "CREATE", allowed: true, scope: "AGENCE_OR_ASSIGNED" },
    { resource: "AGREMENTS", action: "READ", allowed: true, scope: "AGENCE_OR_ASSIGNED" },
    { resource: "AGREMENTS", action: "VALIDATE_N1", allowed: true, scope: "AGENCE_OR_ASSIGNED" },
    { resource: "AGREMENTS", action: "VALIDATE_N2", allowed: true, scope: "AGENCE_OR_ASSIGNED" },
    { resource: "AGREMENTS", action: "FINALIZE", allowed: true, scope: "AGENCE_OR_ASSIGNED" },

    { resource: "REPORTS", action: "READ", allowed: true, scope: "AGENCE_OR_ASSIGNED" },
    { resource: "REPORTS", action: "EXPORT", allowed: true, scope: "AGENCE_OR_ASSIGNED" },

    { resource: "ALERTS", action: "READ", allowed: true, scope: "AGENCE_OR_ASSIGNED" },
    { resource: "NOTIFICATIONS", action: "READ", allowed: true, scope: "OWN_OR_ASSIGNED" },
    { resource: "NOTIFICATIONS", action: "UPDATE", allowed: true, scope: "OWN_OR_ASSIGNED" },

    { resource: "PARAMETRES", action: "CONFIGURE", allowed: false },
  ],

  SUPERVISEUR_REGIONAL: [
    { resource: "CONCESSIONNAIRES", action: "READ", allowed: true, scope: "AGENCE_OR_ASSIGNED" },
    { resource: "CONTRATS", action: "READ", allowed: true, scope: "AGENCE_OR_ASSIGNED" },
    { resource: "DOSSIERS", action: "READ", allowed: true, scope: "AGENCE_OR_ASSIGNED" },
    { resource: "CAUTIONS", action: "READ", allowed: true, scope: "AGENCE_OR_ASSIGNED" },
    { resource: "PDV_INTEGRATIONS", action: "READ", allowed: true, scope: "AGENCE_OR_ASSIGNED" },
    { resource: "AGREMENTS", action: "READ", allowed: true, scope: "AGENCE_OR_ASSIGNED" },
    { resource: "REPORTS", action: "READ", allowed: true, scope: "AGENCE_OR_ASSIGNED" },
    { resource: "REPORTS", action: "EXPORT", allowed: true, scope: "AGENCE_OR_ASSIGNED" },
    { resource: "ALERTS", action: "READ", allowed: true, scope: "AGENCE_OR_ASSIGNED" },
    { resource: "NOTIFICATIONS", action: "READ", allowed: true, scope: "OWN_OR_ASSIGNED" },
    { resource: "NOTIFICATIONS", action: "UPDATE", allowed: true, scope: "OWN_OR_ASSIGNED" },
    { resource: "PARAMETRES", action: "CONFIGURE", allowed: false },
  ],

  AUDITEUR: [
    { resource: "CONCESSIONNAIRES", action: "READ", allowed: true, scope: "GLOBAL" },
    { resource: "CONTRATS", action: "READ", allowed: true, scope: "GLOBAL" },
    { resource: "DOSSIERS", action: "READ", allowed: true, scope: "GLOBAL" },
    { resource: "CAUTIONS", action: "READ", allowed: true, scope: "GLOBAL" },
    { resource: "PDV_INTEGRATIONS", action: "READ", allowed: true, scope: "GLOBAL" },
    { resource: "AGREMENTS", action: "READ", allowed: true, scope: "GLOBAL" },
    { resource: "REPORTS", action: "READ", allowed: true, scope: "GLOBAL" },
    { resource: "REPORTS", action: "EXPORT", allowed: true, scope: "GLOBAL" },
    { resource: "ALERTS", action: "READ", allowed: true, scope: "GLOBAL" },
    { resource: "NOTIFICATIONS", action: "READ", allowed: true, scope: "OWN_OR_ASSIGNED" },
    { resource: "NOTIFICATIONS", action: "UPDATE", allowed: true, scope: "OWN_OR_ASSIGNED" },
    { resource: "PARAMETRES", action: "CONFIGURE", allowed: false },
  ],

  LECTURE_SEULE: [
    { resource: "CONCESSIONNAIRES", action: "READ", allowed: true, scope: "AGENCE_OR_ASSIGNED" },
    { resource: "CONTRATS", action: "READ", allowed: true, scope: "AGENCE_OR_ASSIGNED" },
    { resource: "DOSSIERS", action: "READ", allowed: true, scope: "AGENCE_OR_ASSIGNED" },
    { resource: "CAUTIONS", action: "READ", allowed: true, scope: "AGENCE_OR_ASSIGNED" },
    { resource: "PDV_INTEGRATIONS", action: "READ", allowed: true, scope: "AGENCE_OR_ASSIGNED" },
    { resource: "AGREMENTS", action: "READ", allowed: true, scope: "AGENCE_OR_ASSIGNED" },
    { resource: "REPORTS", action: "READ", allowed: true, scope: "AGENCE_OR_ASSIGNED" },
    { resource: "ALERTS", action: "READ", allowed: true, scope: "AGENCE_OR_ASSIGNED" },
    { resource: "NOTIFICATIONS", action: "READ", allowed: true, scope: "OWN_OR_ASSIGNED" },
    { resource: "NOTIFICATIONS", action: "UPDATE", allowed: true, scope: "OWN_OR_ASSIGNED" },
    { resource: "PARAMETRES", action: "CONFIGURE", allowed: false },
  ],

  CHEF_SERVICE: RBAC_RESOURCES.flatMap((resource) => {
    const actions: RbacAction[] = [
      "CREATE",
      "READ",
      "UPDATE",
      "DEACTIVATE",
      "VALIDATE_N1",
      "VALIDATE_N2",
      "REJECT",
      "RETURN_FOR_CORRECTION",
      "FINALIZE",
      "EXPORT",
      "CONFIGURE",
    ];
    return actions.map((action) => ({
      resource,
      action,
      allowed: true,
      scope: "GLOBAL" as const,
    }));
  }),
};

export interface RbacCheckInput {
  role: LonaciRole;
  resource: RbacResource;
  action: RbacAction;
}

export interface RbacCheckResult {
  allowed: boolean;
  scope?: ScopeRule;
  notes?: string;
}

export function canRole(input: RbacCheckInput): RbacCheckResult {
  const rules = RBAC_MATRIX[input.role] ?? [];
  const hit = rules.find((r) => r.resource === input.resource && r.action === input.action);
  if (!hit) return { allowed: false };
  return { allowed: hit.allowed, scope: hit.scope, notes: hit.notes };
}

export function isGlobalRole(role: LonaciRole): boolean {
  return role === "CHEF_SERVICE" || role === "AUDITEUR";
}
