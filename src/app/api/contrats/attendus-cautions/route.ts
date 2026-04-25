import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ObjectId } from "mongodb";

import { zodBadRequest } from "@/lib/api/endpoint-helpers";
import {
  CONTRATS_ATTENDUS_CAUTIONS_MAX,
  listScopeAgenceIdForContratsList,
} from "@/lib/lonaci/contracts";
import { ensureSprint4Indexes, listContratsCautionAttendus } from "@/lib/lonaci/sprint4";
import { getDatabase } from "@/lib/mongodb";
import { prisma } from "@/lib/prisma";
import { requireApiAuth } from "@/lib/auth/guards";

/** Mêmes filtres que la liste contrats (hors pagination). */
const attendusQuerySchema = z.object({
  concessionnaireId: z.string().optional(),
  produitCode: z.string().optional(),
  status: z.enum(["ACTIF", "RESILIE", "CEDE"]).optional(),
  q: z.string().max(120).optional(),
  agenceId: z.string().optional(),
  dossierStatus: z.enum(["BROUILLON", "SOUMIS", "VALIDE_N1", "VALIDE_N2", "FINALISE", "REJETE"]).optional(),
  monthCurrent: z.coerce.boolean().optional().default(false),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, {
    roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
  });
  if ("error" in auth) return auth.error;

  const raw = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = attendusQuerySchema.safeParse(raw);
  if (!parsed.success) {
    return zodBadRequest(parsed.error, "Parametres invalides");
  }

  const db = await getDatabase();

  let allowedConcessionnaireIds: string[] | null = null;
  const scopeAgenceId = listScopeAgenceIdForContratsList(auth.user);
  if (scopeAgenceId) {
    const scoped = await prisma.concessionnaire.findMany({
      where: { deletedAt: null, agenceId: scopeAgenceId },
      select: { id: true },
    });
    allowedConcessionnaireIds = scoped.map((c) => c.id);
  }

  let dossierIdsAllowlist: string[] | null = null;
  if (parsed.data.dossierStatus) {
    const rows = await db
      .collection<{ _id: ObjectId }>("dossiers")
      .find({
        deletedAt: null,
        type: "CONTRAT_ACTUALISATION",
        status: parsed.data.dossierStatus,
      })
      .project({ _id: 1 })
      .limit(2000)
      .toArray();
    dossierIdsAllowlist = rows.map((r) => r._id.toHexString());
  }

  let dateEffetFrom: Date | undefined;
  let dateEffetTo: Date | undefined;
  if (parsed.data.monthCurrent) {
    const now = new Date();
    dateEffetFrom = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    dateEffetTo = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  } else {
    if (parsed.data.dateFrom?.trim()) {
      const t = Date.parse(parsed.data.dateFrom.trim());
      if (!Number.isNaN(t)) dateEffetFrom = new Date(t);
    }
    if (parsed.data.dateTo?.trim()) {
      const t = Date.parse(parsed.data.dateTo.trim());
      if (!Number.isNaN(t)) dateEffetTo = new Date(t);
    }
  }

  const agenceIdForList = scopeAgenceId ?? parsed.data.agenceId ?? undefined;

  const listBase = {
    concessionnaireId: parsed.data.concessionnaireId,
    produitCode: parsed.data.produitCode,
    status: parsed.data.status,
    referenceContains: parsed.data.q,
    allowedConcessionnaireIds,
    agenceId: agenceIdForList,
    dateEffetFrom,
    dateEffetTo,
    dossierIdsAllowlist,
  };

  await ensureSprint4Indexes();
  const rows = await listContratsCautionAttendus(listBase);

  const truncated = rows.length >= CONTRATS_ATTENDUS_CAUTIONS_MAX;

  return NextResponse.json({ rows, truncated, maxRows: CONTRATS_ATTENDUS_CAUTIONS_MAX }, { status: 200 });
}
