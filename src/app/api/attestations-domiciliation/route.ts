import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { badRequest } from "@/lib/api/error-responses";
import { zodBadRequest } from "@/lib/api/endpoint-helpers";
import { requireListAgenceScope, listAgenceScopeFields } from "@/lib/api/list-agence-scope";
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
  lonaciClientId: z.string().optional(),
  produitCode: z.string().optional(),
  statut: z.enum(["DEMANDE_RECUE", "TRANSMIS", "FINALISE", "VALIDE", "ENVOYE_CLIENT"]).optional(),
  agenceId: z.string().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
});

const createSchema = z.object({
  type: z.enum(["ATTESTATION_REVENU", "DOMICILIATION_PRODUIT"]),
  concessionnaireId: z.string().trim().min(1).nullable().optional(),
  lonaciClientId: z.string().trim().min(1).nullable().optional(),
  produitCode: z.string().trim().min(1).nullable().optional(),
  dateDemande: z.string().datetime(),
  observations: z.string().trim().max(4000).nullable().optional(),
});

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, { roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"] });
  if ("error" in auth) return auth.error;

  const parsed = listSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
  if (!parsed.success) {
    return zodBadRequest(parsed.error, "Parametres invalides");
  }

  await ensureAttestationsDomiciliationIndexes();
  const agenceScope = requireListAgenceScope(auth.user, parsed.data.agenceId);
  if (!agenceScope.ok) return agenceScope.response;
  const { listFilterConcessionnaireId } = await import("@/lib/lonaci/client-party-resolve");
  const concessionnaireFilter = await listFilterConcessionnaireId({
    lonaciClientId: parsed.data.lonaciClientId,
    concessionnaireId: parsed.data.concessionnaireId,
  });

  const result = await listDemandesAttestationsDomiciliation({
    page: parsed.data.page,
    pageSize: parsed.data.pageSize,
    type: parsed.data.type,
    concessionnaireId: concessionnaireFilter,
    produitCode: parsed.data.produitCode?.trim() || undefined,
    statut: parsed.data.statut,
    ...listAgenceScopeFields(agenceScope),
    dateFrom: parsed.data.dateFrom ? new Date(parsed.data.dateFrom) : undefined,
    dateTo: parsed.data.dateTo ? new Date(parsed.data.dateTo) : undefined,
  });
  return NextResponse.json(result, { status: 200 });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(request, { roles: ["AGENT", "CHEF_SECTION"] });
  if ("error" in auth) return auth.error;

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return zodBadRequest(parsed.error);
  }

  const dateDemande = new Date(parsed.data.dateDemande);
  if (Number.isNaN(dateDemande.getTime())) {
    return badRequest("Date de demande invalide.", "INVALID_DATE_DEMANDE");
  }

  await ensureAttestationsDomiciliationIndexes();
  const { resolveFormPartyIds } = await import("@/lib/lonaci/client-party-resolve");
  let partyConcessionnaireId: string | null = null;
  const clientId = (parsed.data.lonaciClientId ?? "").trim() || null;
  const legacyPdv = (parsed.data.concessionnaireId ?? "").trim() || null;
  if (clientId || legacyPdv) {
    try {
      const party = await resolveFormPartyIds({
        lonaciClientId: clientId,
        concessionnaireId: legacyPdv,
      });
      partyConcessionnaireId = party.concessionnaireId;
    } catch (error) {
      const code = error instanceof Error ? error.message : "UNKNOWN";
      if (code === "CLIENT_NOT_FOUND") {
        return badRequest("Client introuvable.", "CLIENT_NOT_FOUND");
      }
      return badRequest("Client invalide.", "CLIENT_INVALID");
    }
  }
  const created = await createDemandeAttestationDomiciliation({
    type: parsed.data.type,
    concessionnaireId: partyConcessionnaireId,
    produitCode: parsed.data.produitCode ?? null,
    dateDemande,
    observations: parsed.data.observations ?? null,
    actorId: auth.user._id ?? "",
  });

  return NextResponse.json({ item: { id: created.id, statut: created.statut } }, { status: 201 });
}

