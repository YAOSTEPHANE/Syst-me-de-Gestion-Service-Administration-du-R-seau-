import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireApiAuth } from "@/lib/auth/guards";
import {
  createGprRegistration,
  ensureGprGrattageIndexes,
  GPR_REGISTRATION_STATUSES,
  listGprRegistrations,
} from "@/lib/lonaci/gpr-grattage";

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(GPR_REGISTRATION_STATUSES).optional(),
});

const createSchema = z.object({
  concessionnaireId: z.string().min(1),
  produitsActifs: z.array(z.string().min(1)).min(1),
  dateEnregistrement: z.string().datetime(),
});

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, { roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"] });
  if ("error" in auth) return auth.error;
  const parsed = listSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json({ message: "Parametres invalides", issues: parsed.error.issues }, { status: 400 });
  }
  await ensureGprGrattageIndexes();
  const data = await listGprRegistrations(parsed.data);
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
  const created = await createGprRegistration({
    concessionnaireId: parsed.data.concessionnaireId,
    produitsActifs: parsed.data.produitsActifs.map((p) => p.trim().toUpperCase()),
    dateEnregistrement: new Date(parsed.data.dateEnregistrement),
    actor: auth.user,
  });
  return NextResponse.json({ registration: created }, { status: 201 });
}
