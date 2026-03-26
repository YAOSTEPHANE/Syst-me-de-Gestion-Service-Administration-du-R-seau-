import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createPdvIntegration, ensureSprint4Indexes, listPdvIntegrations } from "@/lib/lonaci/sprint4";
import { PDV_INTEGRATION_STATUSES } from "@/lib/lonaci/constants";
import { requireApiAuth } from "@/lib/auth/guards";

const createSchema = z.object({
  agenceId: z.string().nullable().optional(),
  produitCode: z.string().min(2),
  nombreDemandes: z.number().int().min(1),
  dateDemande: z.string().datetime(),
  gps: z.object({
    lat: z.number().gte(-90).lte(90),
    lng: z.number().gte(-180).lte(180),
  }),
  observations: z.string().max(2000).nullable().optional(),
});

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  agenceId: z.string().optional(),
  produitCode: z.string().optional(),
  status: z.enum(PDV_INTEGRATION_STATUSES).optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
});

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, { roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"] });
  if ("error" in auth) return auth.error;

  const parsed = listSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json({ message: "Parametres invalides", issues: parsed.error.issues }, { status: 400 });
  }

  await ensureSprint4Indexes();
  const result = await listPdvIntegrations({
    page: parsed.data.page,
    pageSize: parsed.data.pageSize,
    agenceId: parsed.data.agenceId?.trim() || undefined,
    produitCode: parsed.data.produitCode?.trim() || undefined,
    status: parsed.data.status,
    dateFrom: parsed.data.dateFrom ? new Date(parsed.data.dateFrom) : undefined,
    dateTo: parsed.data.dateTo ? new Date(parsed.data.dateTo) : undefined,
  });
  return NextResponse.json(result, { status: 200 });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(request, { roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"] });
  if ("error" in auth) return auth.error;

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "Donnees invalides", issues: parsed.error.issues }, { status: 400 });
  }

  await ensureSprint4Indexes();
  const integration = await createPdvIntegration({
    agenceId: parsed.data.agenceId ?? null,
    produitCode: parsed.data.produitCode,
    nombreDemandes: parsed.data.nombreDemandes,
    dateDemande: new Date(parsed.data.dateDemande),
    gps: parsed.data.gps,
    observations: parsed.data.observations ?? null,
    actor: auth.user,
  });
  return NextResponse.json({ integration }, { status: 201 });
}
