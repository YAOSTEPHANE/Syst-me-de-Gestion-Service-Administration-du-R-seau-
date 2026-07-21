import { buildWorkflowVisibilityMongoFilter } from "@/lib/auth/workflow-visibility";
import { listAgrements } from "@/lib/lonaci/agrements";
import { listBancarisationRequests } from "@/lib/lonaci/bancarisation";
import { listCessions } from "@/lib/lonaci/cessions";
import { listDossiers } from "@/lib/lonaci/dossiers";
import { listGprRegistrations } from "@/lib/lonaci/gpr-grattage";
import type { ListAgenceRestriction } from "@/lib/lonaci/list-agence-restriction";
import { restrictionToMongoAgenceFilter } from "@/lib/lonaci/list-agence-restriction";
import { listResiliations } from "@/lib/lonaci/resiliations";
import { listSuccessionCases } from "@/lib/lonaci/succession";
import type { UserDocument } from "@/lib/lonaci/types";
import { roleHasWorkflowQueue } from "@/lib/lonaci/workflow-ui-policy";
import { getDatabase } from "@/lib/mongodb";

export interface WorkflowQueueCounts {
  dossiers: number | null;
  cautions: number | null;
  agrements: number | null;
  cessions: number | null;
  delocalisations: number | null;
  resiliations: number | null;
  successions: number | null;
  bancarisation: number | null;
  gpr: number | null;
}

const EMPTY_QUEUES: WorkflowQueueCounts = {
  dossiers: null,
  cautions: null,
  agrements: null,
  cessions: null,
  delocalisations: null,
  resiliations: null,
  successions: null,
  bancarisation: null,
  gpr: null,
};

async function countVisibleCautions(
  actor: UserDocument,
  restriction: ListAgenceRestriction,
): Promise<number> {
  const db = await getDatabase();
  const agence = restrictionToMongoAgenceFilter(restriction);
  const visibility = buildWorkflowVisibilityMongoFilter({
    workflow: "CAUTIONS",
    role: actor.role,
    userId: actor._id ?? "",
    correctionField: "correctionReturnLevel",
  });
  return await db.collection("cautions").countDocuments({
    deletedAt: null,
    ...(agence ? { agenceId: agence } : {}),
    $and: [visibility ?? { _id: { $in: [] } }],
  });
}

export async function getWorkflowQueueCounts(
  actor: UserDocument,
  restriction: ListAgenceRestriction,
): Promise<WorkflowQueueCounts> {
  if (!roleHasWorkflowQueue(actor.role)) return EMPTY_QUEUES;

  const scopeAgenceId = restriction.agenceId;
  const scopeAgenceIds = restriction.agenceIds;
  const [
    dossiers,
    cautions,
    agrements,
    cessions,
    delocalisations,
    resiliations,
    successions,
    bancarisation,
    gpr,
  ] = await Promise.all([
    listDossiers(1, 1, undefined, undefined, restriction, actor),
    countVisibleCautions(actor, restriction),
    listAgrements({ page: 1, pageSize: 1, actor, ...restriction }),
    listCessions({ page: 1, pageSize: 1, actor, kind: "CESSION", ...restriction }),
    listCessions({ page: 1, pageSize: 1, actor, kind: "DELOCALISATION", ...restriction }),
    listResiliations({ page: 1, pageSize: 1, actor, ...restriction }),
    listSuccessionCases(1, 1, restriction, undefined, { visibility: actor }),
    listBancarisationRequests({
      page: 1,
      pageSize: 1,
      scopeAgenceId,
      scopeAgenceIds,
      visibility: actor,
    }),
    listGprRegistrations({
      page: 1,
      pageSize: 1,
      scopeAgenceId,
      scopeAgenceIds,
      visibility: actor,
    }),
  ]);

  return {
    dossiers: dossiers.total,
    cautions,
    agrements: agrements.total,
    cessions: cessions.total,
    delocalisations: delocalisations.total,
    resiliations: resiliations.total,
    successions: successions.total,
    bancarisation: bancarisation.total,
    gpr: gpr.total,
  };
}
