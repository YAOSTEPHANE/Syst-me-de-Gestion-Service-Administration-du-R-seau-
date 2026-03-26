import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  createDemandeAttestationDomiciliation,
  ensureAttestationsDomiciliationIndexes,
  listDemandesAttestationsDomiciliation,
} from "@/lib/lonaci/attestations-domiciliation";
import { requireApiAuth } from "@/lib/auth/guards";

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  type: z.enum(["ATTESTATION_REVENU", "DOMICILIATION_PRODUIT"]).optional(),
  concessionnaireId: z.string().optional(),
  produitCode: z.string().optional(),
  statut: z.enum(["DEMANDE_RECUE", "TRANSMIS", "FINALISE"]).optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
});

const createSchema = z.object({
  type: z.enum(["ATTESTATION_REVENU", "DOMICILIATION_PRODUIT"]),
  concessionnaireId: z.string().trim().min(1).nullable().optional(),
  produitCode: z.string().trim().min(1).nullable().optional(),
  dateDemande: z.string().datetime(),
  observations: z.string().trim().max(4000).nullable().optional(),
});

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, { roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"] });
  if ("error" in auth) return auth.error;

  const parsed = listSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json({ message: "Parametres invalides", issues: parsed.error.issues }, { status: 400 });
  }

  await ensureAttestationsDomiciliationIndexes();
  const result = await listDemandesAttestationsDomiciliation({
    page: parsed.data.page,
    pageSize: parsed.data.pageSize,
    type: parsed.data.type,
    concessionnaireId: parsed.data.concessionnaireId?.trim() || undefined,
    produitCode: parsed.data.produitCode?.trim() || undefined,
    statut: parsed.data.statut,
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

  const dateDemande = new Date(parsed.data.dateDemande);
  if (Number.isNaN(dateDemande.getTime())) {
    return NextResponse.json({ message: "Date de demande invalide." }, { status: 400 });
  }

  await ensureAttestationsDomiciliationIndexes();
  const created = await createDemandeAttestationDomiciliation({
    type: parsed.data.type,
    concessionnaireId: parsed.data.concessionnaireId ?? null,
    produitCode: parsed.data.produitCode ?? null,
    dateDemande,
    observations: parsed.data.observations ?? null,
    actorId: auth.user._id ?? "",
  });

  return NextResponse.json({ item: { id: created.id, statut: created.statut } }, { status: 201 });
}

