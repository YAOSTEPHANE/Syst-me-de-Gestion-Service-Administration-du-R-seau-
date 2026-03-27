import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireApiAuth } from "@/lib/auth/guards";
import { createScratchLot, ensureGprGrattageIndexes, listScratchLots } from "@/lib/lonaci/gpr-grattage";

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const createSchema = z.object({
  lotId: z.string().trim().min(2).max(64).optional(),
  nombreCodes: z.number().int().min(1).max(5000),
  concessionnaireId: z.string().min(1),
  produitCode: z.string().min(1),
});

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, { roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"] });
  if ("error" in auth) return auth.error;
  const parsed = listSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json({ message: "Parametres invalides", issues: parsed.error.issues }, { status: 400 });
  }
  await ensureGprGrattageIndexes();
  const data = await listScratchLots(parsed.data);
  return NextResponse.json(data, { status: 200 });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(request, { roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"] });
  if ("error" in auth) return auth.error;
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "Donnees invalides", issues: parsed.error.issues }, { status: 400 });
  }
  await ensureGprGrattageIndexes();
  const created = await createScratchLot({
    lotId: parsed.data.lotId?.trim().toUpperCase(),
    nombreCodes: parsed.data.nombreCodes,
    concessionnaireId: parsed.data.concessionnaireId,
    produitCode: parsed.data.produitCode.trim().toUpperCase(),
    actor: auth.user,
  });
  return NextResponse.json({ ok: true, lotId: created.lotId, generatedCount: created.generatedCount }, { status: 201 });
}
