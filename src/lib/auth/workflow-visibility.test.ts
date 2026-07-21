import { describe, expect, it } from "vitest";

import type { LonaciRole } from "@/lib/lonaci/constants";
import {
  buildWorkflowVisibilityMongoFilter,
  deriveSuccessionVisibilityState,
  getVisibleSuccessionStates,
  getVisibleWorkflowStatuses,
  isWorkflowDocumentVisible,
  isWorkflowStageAssignedToRole,
  type HierarchicalWorkflow,
  type SuccessionVisibilityState,
} from "@/lib/auth/workflow-visibility";

interface WorkflowCase {
  workflow: Exclude<HierarchicalWorkflow, "SUCCESSIONS">;
  n1: string;
  n2: string;
  finalQueue: string;
  finalized: readonly string[];
  rejected: readonly string[];
}

const WORKFLOW_CASES: readonly WorkflowCase[] = [
  {
    workflow: "DOSSIERS",
    n1: "SOUMIS",
    n2: "VALIDE_N1",
    finalQueue: "VALIDE_N2",
    finalized: ["FINALISE"],
    rejected: ["REJETE"],
  },
  {
    workflow: "CAUTIONS",
    n1: "EN_ATTENTE",
    n2: "VALIDE_N1",
    finalQueue: "VALIDE_N2",
    finalized: ["PAYEE", "EXONEREE"],
    rejected: ["ANNULEE"],
  },
  {
    workflow: "AGREMENTS",
    n1: "RECU",
    n2: "CONTROLE",
    finalQueue: "TRANSMIS",
    finalized: ["FINALISE"],
    rejected: [],
  },
  {
    workflow: "CESSIONS",
    n1: "SAISIE_AGENT",
    n2: "CONTROLE_CHEF_SECTION",
    finalQueue: "VALIDATION_N2",
    finalized: ["VALIDEE_CHEF_SERVICE"],
    rejected: ["REJETEE"],
  },
  {
    workflow: "RESILIATIONS",
    n1: "DOSSIER_RECU",
    n2: "CONTROLE_CHEF_SECTION",
    finalQueue: "VALIDATION_N2",
    finalized: ["RESILIE"],
    rejected: ["REJETEE"],
  },
  {
    workflow: "BANCARISATION",
    n1: "SOUMIS",
    n2: "VALIDE_N1",
    finalQueue: "VALIDE_N2",
    finalized: ["VALIDE"],
    rejected: ["REJETE"],
  },
  {
    workflow: "GPR",
    n1: "SOUMIS_AGENT",
    n2: "VALIDE_N1",
    finalQueue: "VALIDE_N2",
    finalized: ["SUIVI_CHEF_SERVICE"],
    rejected: ["REJETE"],
  },
];

describe.each(WORKFLOW_CASES)("visibilité hiérarchique $workflow", (row) => {
  const actor = "viewer";

  it.each([
    ["CHEF_SECTION", row.n1, true],
    ["CHEF_SECTION", row.n2, false],
    ["ASSIST_CDS", row.n1, false],
    ["ASSIST_CDS", row.n2, true],
    ["ASSIST_CDS", row.finalQueue, false],
    ["CHEF_SERVICE", row.n2, false],
    ["CHEF_SERVICE", row.finalQueue, true],
  ] as const)("%s / %s => %s", (role, status, expected) => {
    expect(
      isWorkflowDocumentVisible({
        workflow: row.workflow,
        role,
        userId: actor,
        creatorId: "creator",
        status,
      }),
    ).toBe(expected);
  });

  it("donne au dernier niveau sa file active et les finalisés", () => {
    expect(getVisibleWorkflowStatuses(row.workflow, "CHEF_SERVICE")).toEqual([
      row.finalQueue,
      ...row.finalized,
    ]);
  });

  it("limite l'auditeur aux finalisés et rejetés", () => {
    expect(getVisibleWorkflowStatuses(row.workflow, "AUDITEUR")).toEqual([
      ...row.finalized,
      ...row.rejected,
    ]);
    expect(
      isWorkflowDocumentVisible({
        workflow: row.workflow,
        role: "AUDITEUR",
        userId: actor,
        creatorId: "creator",
        status: row.n1,
      }),
    ).toBe(false);
  });
});

describe("visibilité hiérarchique DELOCALISATIONS", () => {
  it("saute N2 et transmet directement N1 au chef de service", () => {
    expect(getVisibleWorkflowStatuses("DELOCALISATIONS", "CHEF_SECTION")).toEqual(["SAISIE_AGENT"]);
    expect(getVisibleWorkflowStatuses("DELOCALISATIONS", "ASSIST_CDS")).toEqual([]);
    expect(getVisibleWorkflowStatuses("DELOCALISATIONS", "CHEF_SERVICE")).toEqual([
      "CONTROLE_CHEF_SECTION",
      "VALIDEE_CHEF_SERVICE",
    ]);
  });
});

describe("règles transverses", () => {
  it.each<LonaciRole>(["DISPATCHER", "SUPERVISEUR_REGIONAL", "LECTURE_SEULE"])(
    "masque les éléments non créés au rôle %s",
    (role) => {
      expect(
        isWorkflowDocumentVisible({
          workflow: "DOSSIERS",
          role,
          userId: "viewer",
          creatorId: "creator",
          status: "FINALISE",
        }),
      ).toBe(false);
    },
  );

  it.each(WORKFLOW_CASES)("laisse toujours le créateur voir un $workflow connu", ({ workflow, n1 }) => {
    expect(
      isWorkflowDocumentVisible({
        workflow,
        role: "AGENT",
        userId: "creator",
        creatorId: "creator",
        status: n1,
      }),
    ).toBe(true);
  });

  it("échoue fermé pour un statut inconnu, même pour le créateur", () => {
    expect(
      isWorkflowDocumentVisible({
        workflow: "DOSSIERS",
        role: "AGENT",
        userId: "creator",
        creatorId: "creator",
        status: "STATUT_INCONNU",
      }),
    ).toBe(false);
  });

  it.each<LonaciRole>(["CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"])(
    "masque une correction au validateur %s",
    (role) => {
      const activeStatus = getVisibleWorkflowStatuses("DOSSIERS", role)[0];
      expect(
        isWorkflowDocumentVisible({
          workflow: "DOSSIERS",
          role,
          userId: "validator",
          creatorId: "creator",
          status: activeStatus,
          inCorrection: true,
        }),
      ).toBe(false);
    },
  );

  it("laisse le créateur voir sa correction", () => {
    expect(
      isWorkflowDocumentVisible({
        workflow: "CAUTIONS",
        role: "AGENT",
        userId: "creator",
        creatorId: "creator",
        status: "A_CORRIGER",
      }),
    ).toBe(true);
  });

  it.each([
    ["BANCARISATION", "CHEF_SECTION", "SOUMIS", true],
    ["BANCARISATION", "ASSIST_CDS", "SOUMIS", false],
    ["GPR", "ASSIST_CDS", "VALIDE_N1", true],
    ["GPR", "CHEF_SERVICE", "VALIDE_N1", false],
  ] as const)("assigne l'étape %s/%s au seul rôle courant", (workflow, role, status, expected) => {
    expect(isWorkflowStageAssignedToRole({ workflow, role, status })).toBe(expected);
  });
});

describe("successions à état dérivé", () => {
  it.each([
    [{ status: "OUVERT", validationN1At: null, validationN2At: null }, "EN_ATTENTE_N1"],
    [{ status: "OUVERT", validationN1At: "2026-01-01", validationN2At: null }, "EN_ATTENTE_N2"],
    [
      { status: "OUVERT", validationN1At: "2026-01-01", validationN2At: "2026-01-02" },
      "EN_ATTENTE_FINALISATION",
    ],
    [{ status: "CLOTURE", validationN1At: null, validationN2At: null }, "FINALISE"],
    [{ status: "INCONNU", validationN1At: null, validationN2At: null }, null],
    [{ status: "OUVERT", validationN1At: null, validationN2At: "2026-01-02" }, null],
  ] as const)("dérive %o en %s", (source, expected) => {
    expect(deriveSuccessionVisibilityState(source)).toBe(expected);
  });

  it.each([
    ["CHEF_SECTION", "EN_ATTENTE_N1", true],
    ["CHEF_SECTION", "EN_ATTENTE_N2", false],
    ["ASSIST_CDS", "EN_ATTENTE_N2", true],
    ["ASSIST_CDS", "EN_ATTENTE_FINALISATION", false],
    ["CHEF_SERVICE", "EN_ATTENTE_FINALISATION", true],
    ["CHEF_SERVICE", "FINALISE", true],
    ["AUDITEUR", "FINALISE", true],
    ["AUDITEUR", "EN_ATTENTE_FINALISATION", false],
  ] as const)(
    "%s voit l'état %s => %s",
    (role, successionState: SuccessionVisibilityState, expected) => {
      const status = successionState === "FINALISE" ? "CLOTURE" : "OUVERT";
      expect(
        isWorkflowDocumentVisible({
          workflow: "SUCCESSIONS",
          role,
          userId: "viewer",
          creatorId: "creator",
          status,
          successionState,
        }),
      ).toBe(expected);
    },
  );

  it("expose les files dérivées sans élargir le statut brut OUVERT", () => {
    expect(getVisibleSuccessionStates("ASSIST_CDS")).toEqual(["EN_ATTENTE_N2"]);
    expect(getVisibleWorkflowStatuses("SUCCESSIONS", "ASSIST_CDS")).toEqual([]);
  });

  it("rejette une combinaison statut / état incohérente", () => {
    expect(
      isWorkflowDocumentVisible({
        workflow: "SUCCESSIONS",
        role: "AUDITEUR",
        userId: "viewer",
        creatorId: "creator",
        status: "OUVERT",
        successionState: "FINALISE",
      }),
    ).toBe(false);
  });
});

describe("filtre Mongo sérialisable", () => {
  it("compose créateur, file active et exclusion de correction", () => {
    expect(
      buildWorkflowVisibilityMongoFilter({
        workflow: "DOSSIERS",
        role: "CHEF_SERVICE",
        userId: "user-1",
        statusField: "statut",
        correctionField: "enCorrection",
      }),
    ).toEqual({
      $or: [
        {
          $and: [
            { createdByUserId: "user-1" },
            {
              statut: {
                $in: ["BROUILLON", "SOUMIS", "VALIDE_N1", "VALIDE_N2", "FINALISE", "REJETE"],
              },
            },
          ],
        },
        { statut: { $in: ["VALIDE_N2", "FINALISE"] }, enCorrection: { $ne: true } },
      ],
    });
  });

  it("retourne le filtre créateur seul pour un rôle non concerné", () => {
    expect(
      buildWorkflowVisibilityMongoFilter({
        workflow: "GPR",
        role: "DISPATCHER",
        userId: "user-1",
      }),
    ).toEqual({
      $and: [
        { createdByUserId: "user-1" },
        {
          status: {
            $in: ["SOUMIS_AGENT", "VALIDE_N1", "VALIDE_N2", "SUIVI_CHEF_SERVICE", "REJETE"],
          },
        },
      ],
    });
  });

  it("sérialise les états dérivés succession avant pagination", () => {
    expect(
      buildWorkflowVisibilityMongoFilter({
        workflow: "SUCCESSIONS",
        role: "ASSIST_CDS",
        userId: "user-1",
      }),
    ).toEqual({
      $or: [
        {
          $and: [
            { createdByUserId: "user-1" },
            {
              $or: [
                { status: "OUVERT", validationN1At: null, validationN2At: null },
                { status: "OUVERT", validationN1At: { $ne: null }, validationN2At: null },
                {
                  status: "OUVERT",
                  validationN1At: { $ne: null },
                  validationN2At: { $ne: null },
                },
                { status: "CLOTURE" },
              ],
            },
          ],
        },
        { status: "OUVERT", validationN1At: { $ne: null }, validationN2At: null },
      ],
    });
  });

  it("réserve la transition succession au rôle de l'état dérivé", () => {
    expect(
      isWorkflowStageAssignedToRole({
        workflow: "SUCCESSIONS",
        role: "CHEF_SERVICE",
        status: "OUVERT",
        successionState: "EN_ATTENTE_FINALISATION",
      }),
    ).toBe(true);
    expect(
      isWorkflowStageAssignedToRole({
        workflow: "SUCCESSIONS",
        role: "CHEF_SERVICE",
        status: "CLOTURE",
        successionState: "FINALISE",
      }),
    ).toBe(false);
  });

  it("sérialise le périmètre terminal succession de l'auditeur", () => {
    expect(
      buildWorkflowVisibilityMongoFilter({
        workflow: "SUCCESSIONS",
        role: "AUDITEUR",
        userId: "user-1",
      }),
    ).toEqual({
      $or: [
        {
          $and: [
            { createdByUserId: "user-1" },
            {
              $or: [
                { status: "OUVERT", validationN1At: null, validationN2At: null },
                { status: "OUVERT", validationN1At: { $ne: null }, validationN2At: null },
                {
                  status: "OUVERT",
                  validationN1At: { $ne: null },
                  validationN2At: { $ne: null },
                },
                { status: "CLOTURE" },
              ],
            },
          ],
        },
        { status: "CLOTURE" },
      ],
    });
  });
});
