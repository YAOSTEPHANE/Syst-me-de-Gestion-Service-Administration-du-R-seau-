import { describe, expect, it } from "vitest";

import {
  canShowScratchLotTransition,
  getAssignedWorkflowTarget,
  getRoleWorkflowFilterStatuses,
  parseLonaciRole,
  roleHasWorkflowQueue,
} from "@/lib/lonaci/workflow-ui-policy";

describe("mapping UI des workflows hiérarchiques", () => {
  it.each([
    ["AGREMENTS", "CHEF_SECTION", "RECU", "CONTROLE"],
    ["AGREMENTS", "ASSIST_CDS", "CONTROLE", "TRANSMIS"],
    ["AGREMENTS", "CHEF_SERVICE", "TRANSMIS", "FINALISE"],
    ["CESSIONS", "CHEF_SECTION", "SAISIE_AGENT", "CONTROLE_CHEF_SECTION"],
    ["CESSIONS", "ASSIST_CDS", "CONTROLE_CHEF_SECTION", "VALIDATION_N2"],
    ["DELOCALISATIONS", "CHEF_SERVICE", "CONTROLE_CHEF_SECTION", "VALIDEE_CHEF_SERVICE"],
    ["RESILIATIONS", "CHEF_SERVICE", "VALIDATION_N2", "RESILIE"],
    ["BANCARISATION", "ASSIST_CDS", "VALIDE_N1", "VALIDE_N2"],
    ["GPR", "CHEF_SERVICE", "VALIDE_N2", "SUIVI_CHEF_SERVICE"],
  ] as const)("%s / %s / %s cible %s", (workflow, role, status, expected) => {
    expect(getAssignedWorkflowTarget({ workflow, role, status })).toBe(expected);
  });

  it("n'expose aucune action à un rôle non assigné ou terminal", () => {
    expect(
      getAssignedWorkflowTarget({
        workflow: "AGREMENTS",
        role: "ASSIST_CDS",
        status: "RECU",
      }),
    ).toBeNull();
    expect(
      getAssignedWorkflowTarget({
        workflow: "AGREMENTS",
        role: "AUDITEUR",
        status: "FINALISE",
      }),
    ).toBeNull();
  });

  it("limite les filtres du chef de service à sa file et aux finalisés", () => {
    expect(getRoleWorkflowFilterStatuses("AGREMENTS", "CHEF_SERVICE")).toEqual([
      "TRANSMIS",
      "FINALISE",
    ]);
  });

  it("normalise seulement les rôles connus et les rôles ayant une file", () => {
    expect(parseLonaciRole("CHEF_SECTION")).toBe("CHEF_SECTION");
    expect(parseLonaciRole("INCONNU")).toBeNull();
    expect(roleHasWorkflowQueue(parseLonaciRole("AUDITEUR"))).toBe(true);
    expect(roleHasWorkflowQueue(parseLonaciRole("SUPERVISEUR_REGIONAL"))).toBe(false);
  });

  it("masque les transitions de lots grattage exposées au mauvais rôle", () => {
    expect(canShowScratchLotTransition("ASSIST_CDS", "ATTRIBUE", "ACTIF")).toBe(false);
    expect(canShowScratchLotTransition("CHEF_SECTION", "ATTRIBUE", "ACTIF")).toBe(true);
    expect(canShowScratchLotTransition("AUDITEUR", "ACTIF", "EPUISE")).toBe(false);
  });
});
