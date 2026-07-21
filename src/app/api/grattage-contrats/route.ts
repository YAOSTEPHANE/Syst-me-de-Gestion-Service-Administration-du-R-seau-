import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { zodBadRequest } from "@/lib/api/endpoint-helpers";
import { requireListAgenceScope, listAgenceScopeFields } from "@/lib/api/list-agence-scope";
import { requireApiAuth } from "@/lib/auth/guards";
import { GRATTAGE_CONTRAT_STATUTS } from "@/lib/lonaci/constants";
import {
  createGrattageContrat,
  ensureGrattageContratIndexes,
  listGrattageContrats,
} from "@/lib/lonaci/grattage-contrats";
import { GRATTAGE_CONTRAT_ROLES } from "@/lib/lonaci/grattage-access";

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  agenceId: z.string().optional(),
  concessionnaireId: z.string().optional(),
  statut: z.enum(GRATTAGE_CONTRAT_STATUTS).optional(),
});

const createSchema = z.object({
  concessionnaireId: z.string().min(1),
  produitCode: z.string().min(1),
  dateDebut: z.string().datetime(),
  dateFin: z.string().datetime().nullable().optional(),
  gprRegistrationId: z.string().optional(),
});

/** Liste des contrats grattage (filtres agence, PDV, statut). */
export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, { roles: [...GRATTAGE_CONTRAT_ROLES] });
  if ("error" in auth) return auth.error;
  const parsed = listSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
  if (!parsed.success) {
    return zodBadRequest(parsed.error, "Parametres invalides");
  }
  await ensureGrattageContratIndexes();
  const agenceScope = requireListAgenceScope(auth.user, parsed.data.agenceId);
  if (!agenceScope.ok) return agenceScope.response;
  const data = await listGrattageContrats({
    page: parsed.data.page,
    pageSize: parsed.data.pageSize,
    concessionnaireId: parsed.data.concessionnaireId,
    statut: parsed.data.statut,
    ...listAgenceScopeFields(agenceScope),
  });
  return NextResponse.json(data, { status: 200 });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(request, { roles: [...GRATTAGE_CONTRAT_ROLES] });
  if ("error" in auth) return auth.error;
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return zodBadRequest(parsed.error);
  }
  await ensureGrattageContratIndexes();
  try {
    const created = await createGrattageContrat({
      concessionnaireId: parsed.data.concessionnaireId,
      produitCode: parsed.data.produitCode,
      dateDebut: new Date(parsed.data.dateDebut),
      dateFin: parsed.data.dateFin ? new Date(parsed.data.dateFin) : null,
      gprRegistrationId: parsed.data.gprRegistrationId,
      actor: auth.user,
    });
    return NextResponse.json({ ok: true, ...created }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "GRATTAGE_CONTRAT_ALREADY_ACTIVE") {
      return NextResponse.json(
        { message: "Un contrat grattage actif existe deja pour ce PDV et ce produit." },
        { status: 409 },
      );
    }
    return NextResponse.json({ message: "Creation impossible." }, { status: 500 });
  }
}
