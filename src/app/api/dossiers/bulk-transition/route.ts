import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { zodBadRequest } from "@/lib/api/endpoint-helpers";
import { ensureDossierIndexes } from "@/lib/lonaci/dossiers";
import { appendBulkTransitionLog, ensureBulkTransitionLogsIndexes } from "@/lib/lonaci/dossier-bulk-transition-logs";
import {
  assertDossierBulkVisibility,
  executeDossierBulkTransition,
  toDossierBulkRbacAction,
  type DossierBulkTransitionAction,
} from "@/lib/lonaci/dossier-bulk-transition";
import { requireApiAuth } from "@/lib/auth/guards";

export const bulkTransitionSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
  action: z.enum([
    "SUBMIT",
    "VALIDATE_N1",
    "VALIDATE_N2",
    "FINALIZE",
    "REJECT",
    "RETURN_PREVIOUS",
    "REJECT_TO_DRAFT",
  ]),
  comment: z.string().max(2000).nullable().optional(),
});

export async function POST(request: NextRequest) {
  const parsed = bulkTransitionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return zodBadRequest(parsed.error);
  }

  if (
    (parsed.data.action === "REJECT" ||
      parsed.data.action === "RETURN_PREVIOUS" ||
      parsed.data.action === "REJECT_TO_DRAFT") &&
    !parsed.data.comment?.trim()
  ) {
    return NextResponse.json({ message: "Motif/commentaire obligatoire pour cette action." }, { status: 400 });
  }

  const auth = await requireApiAuth(request, {
    roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
    rbac: { resource: "DOSSIERS", action: toDossierBulkRbacAction(parsed.data.action as DossierBulkTransitionAction) },
  });
  if ("error" in auth) {
    return auth.error;
  }

  const ids = [...new Set(parsed.data.ids.map((id) => id.trim()).filter(Boolean))];
  await ensureDossierIndexes();
  await ensureBulkTransitionLogsIndexes();
  try {
    await assertDossierBulkVisibility(ids, auth.user);
  } catch {
    return NextResponse.json({ message: "Un ou plusieurs dossiers sont introuvables." }, { status: 404 });
  }

  const execution = await executeDossierBulkTransition({
    ids,
    action: parsed.data.action as DossierBulkTransitionAction,
    comment: parsed.data.comment ?? null,
    actor: auth.user,
  });

  const actorUserId = auth.user._id ?? "";
  if (actorUserId) {
    await appendBulkTransitionLog({
      actorUserId,
      action: parsed.data.action,
      total: execution.total,
      succeeded: execution.succeeded,
      failed: execution.failed,
      comment: parsed.data.comment ?? null,
      resultSample: execution.results,
    });
  }

  return NextResponse.json(execution, { status: 200 });
}
