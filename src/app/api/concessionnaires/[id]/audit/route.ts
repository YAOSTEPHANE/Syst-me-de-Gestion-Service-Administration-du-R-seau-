import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { canReadConcessionnaire } from "@/lib/lonaci/access";
import { ensureAuditIndexes, listAuditLogs } from "@/lib/lonaci/audit";
import {
  formatAuditUserDisplay,
  humanizeConcessionnaireAuditDetails,
} from "@/lib/lonaci/audit-display";
import { ensureConcessionnaireIndexes, findConcessionnaireById } from "@/lib/lonaci/concessionnaires";
import { prisma } from "@/lib/prisma";
import { requireApiAuth } from "@/lib/auth/guards";

function isObjectIdHex(id: string): boolean {
  return /^[a-f\d]{24}$/i.test(id);
}

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth(request, {
    roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
  });
  if ("error" in auth) {
    return auth.error;
  }

  const { id } = await context.params;
  const raw = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = querySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ message: "Parametres invalides", issues: parsed.error.issues }, { status: 400 });
  }

  await ensureConcessionnaireIndexes();
  const doc = await findConcessionnaireById(id);
  if (!doc) {
    return NextResponse.json({ message: "Non trouve" }, { status: 404 });
  }

  if (!canReadConcessionnaire(auth.user, doc)) {
    return NextResponse.json({ message: "Acces refuse" }, { status: 403 });
  }

  await ensureAuditIndexes();
  const result = await listAuditLogs({
    entityType: "CONCESSIONNAIRE",
    entityId: id,
    page: parsed.data.page,
    pageSize: parsed.data.pageSize,
  });

  const userIds = [...new Set(result.items.map((i) => i.userId).filter(isObjectIdHex))];
  const users =
    userIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, email: true, nom: true, prenom: true },
        })
      : [];
  const userById = new Map(users.map((u) => [u.id, formatAuditUserDisplay(u.prenom, u.nom, u.email)]));

  const items = result.items.map((item) => ({
    ...item,
    userDisplay: userById.get(item.userId) ?? null,
    detailsHuman: humanizeConcessionnaireAuditDetails(item.action, item.details),
  }));

  return NextResponse.json({ ...result, items }, { status: 200 });
}
