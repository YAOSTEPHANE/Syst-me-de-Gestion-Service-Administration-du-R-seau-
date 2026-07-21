import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { zodBadRequest } from "@/lib/api/endpoint-helpers";
import { requireApiAuth } from "@/lib/auth/guards";
import { ensureDossierIndexes } from "@/lib/lonaci/dossiers";
import {
  appendBulkTransitionLog,
  ensureBulkTransitionLogsIndexes,
  findBulkTransitionLogById,
} from "@/lib/lonaci/dossier-bulk-transition-logs";
import {
  assertDossierBulkVisibility,
  executeDossierBulkTransition,
  toDossierBulkRbacAction,
  type DossierBulkTransitionAction,
} from "@/lib/lonaci/dossier-bulk-transition";

const replaySchema = z.object({
  logId: z.string().min(1),
  mode: z.enum(["FAILED_ONLY", "ALL_SAMPLE"]).optional().default("FAILED_ONLY"),
  commentOverride: z.string().max(2000).nullable().optional(),
});

export async function POST(request: NextRequest) {
  const parsed = replaySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return zodBadRequest(parsed.error);
  }

  const baseAuth = await requireApiAuth(request, {
    roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
    rbac: { resource: "DOSSIERS", action: "READ" },
  });
  if ("error" in baseAuth) {
    return baseAuth.error;
  }

  await ensureBulkTransitionLogsIndexes();
  const log = await findBulkTransitionLogById(parsed.data.logId);
  if (!log) {
    return NextResponse.json({ message: "Journal introuvable." }, { status: 404 });
  }

  const action = log.action as DossierBulkTransitionAction;
  const actionAuth = await requireApiAuth(request, {
    roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
    rbac: { resource: "DOSSIERS", action: toDossierBulkRbacAction(action) },
  });
  if ("error" in actionAuth) {
    return actionAuth.error;
  }

  const ids =
    parsed.data.mode === "ALL_SAMPLE"
      ? log.resultSample.map((row) => row.id)
      : log.resultSample.filter((row) => !row.ok).map((row) => row.id);

  const uniqueIds = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (!uniqueIds.length) {
    return NextResponse.json({ message: "Aucun dossier à rejouer pour ce journal.", total: 0, succeeded: 0, failed: 0, results: [] }, { status: 200 });
  }
  try {
    await assertDossierBulkVisibility(uniqueIds, actionAuth.user);
  } catch {
    return NextResponse.json({ message: "Journal introuvable." }, { status: 404 });
  }

  const comment = parsed.data.commentOverride ?? log.comment;
  if ((action === "REJECT" || action === "RETURN_PREVIOUS" || action === "REJECT_TO_DRAFT") && !comment?.trim()) {
    return NextResponse.json({ message: "Commentaire requis pour rejouer cette action." }, { status: 400 });
  }

  await ensureDossierIndexes();
  const execution = await executeDossierBulkTransition({
    ids: uniqueIds,
    action,
    comment,
    actor: actionAuth.user,
  });

  const actorUserId = actionAuth.user._id ?? "";
  if (actorUserId) {
    await appendBulkTransitionLog({
      actorUserId,
      action,
      total: execution.total,
      succeeded: execution.succeeded,
      failed: execution.failed,
      comment: comment ?? null,
      resultSample: execution.results,
    });
  }

  return NextResponse.json(execution, { status: 200 });
}
