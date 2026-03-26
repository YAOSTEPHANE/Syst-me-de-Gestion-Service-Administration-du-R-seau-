import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  canCreateConcessionnaireForAgence,
  enforcedAgenceIdOnCreate,
} from "@/lib/lonaci/access";
import { BANCARISATION_STATUTS, CONCESSIONNAIRE_STATUTS } from "@/lib/lonaci/constants";
import {
  concessionnaireListScopeAgenceId,
  createConcessionnaire,
  ensureConcessionnaireIndexes,
  sanitizeConcessionnaireListItem,
  sanitizeConcessionnairePublic,
  searchConcessionnaires,
} from "@/lib/lonaci/concessionnaires";
import { findAgenceById, listProduits } from "@/lib/lonaci/referentials";
import { requireApiAuth } from "@/lib/auth/guards";

const createSchema = z.object({
  nomComplet: z.string().min(2),
  cniNumero: z.union([z.string().min(4).max(64), z.null()]).optional(),
  photoUrl: z.union([z.string().max(2000), z.null()]).optional(),
  email: z.union([z.string().email(), z.null()]).optional(),
  telephonePrincipal: z.union([z.string().min(8).max(32), z.null()]).optional(),
  telephoneSecondaire: z.union([z.string().min(8).max(32), z.null()]).optional(),
  adresse: z.union([z.string().max(500), z.null()]).optional(),
  ville: z.union([z.string().max(120), z.null()]).optional(),
  codePostal: z.union([z.string().max(12), z.null()]).optional(),
  agenceId: z.union([z.string().min(1), z.null()]).optional(),
  produitsAutorises: z.array(z.string().min(1)).default([]),
  statut: z.enum(CONCESSIONNAIRE_STATUTS).optional(),
  statutBancarisation: z.enum(BANCARISATION_STATUTS).default("NON_BANCARISE"),
  compteBancaire: z.union([z.string().max(128), z.null()]).optional(),
  banqueEtablissement: z.union([z.string().max(200), z.null()]).optional(),
  gps: z.object({
    lat: z.number().gte(-90).lte(90),
    lng: z.number().gte(-180).lte(180),
  }),
  observations: z.union([z.string().max(10000), z.null()]).optional(),
  notesInternes: z.union([z.string().max(10000), z.null()]).optional(),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().optional(),
  statut: z.enum(CONCESSIONNAIRE_STATUTS).optional(),
  statutBancarisation: z.enum(BANCARISATION_STATUTS).optional(),
  agenceId: z.string().optional(),
  produitCode: z.string().optional(),
  includeDeleted: z.enum(["true", "false"]).optional(),
});

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, {
    roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
  });
  if ("error" in auth) {
    return auth.error;
  }

  const raw = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = listQuerySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ message: "Parametres invalides", issues: parsed.error.issues }, { status: 400 });
  }

  const includeDeleted =
    parsed.data.includeDeleted === "true" && auth.user.role === "CHEF_SERVICE";

  await ensureConcessionnaireIndexes();
  const scope = concessionnaireListScopeAgenceId(auth.user);
  const result = await searchConcessionnaires({
    page: parsed.data.page,
    pageSize: parsed.data.pageSize,
    q: parsed.data.q,
    statut: parsed.data.statut,
    statutBancarisation: parsed.data.statutBancarisation,
    agenceId: parsed.data.agenceId,
    produitCode: parsed.data.produitCode,
    scopeAgenceId: scope,
    includeDeleted,
  });

  return NextResponse.json({
    ...result,
    items: result.items.map(sanitizeConcessionnaireListItem),
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(request, {
    roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
  });
  if ("error" in auth) {
    return auth.error;
  }

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "Donnees invalides", issues: parsed.error.issues }, { status: 400 });
  }

  const requestedAgenceId =
    parsed.data.agenceId === undefined ? null : parsed.data.agenceId;
  const agenceId = enforcedAgenceIdOnCreate(auth.user, requestedAgenceId);

  if (!agenceId) {
    return NextResponse.json(
      { message: "Agence de rattachement obligatoire pour attribuer le code PDV." },
      { status: 400 },
    );
  }

  if (!canCreateConcessionnaireForAgence(auth.user, agenceId)) {
    return NextResponse.json({ message: "Acces refuse pour cette agence" }, { status: 403 });
  }

  const agence = await findAgenceById(agenceId);
  if (!agence || !agence.actif || !agence.code) {
    return NextResponse.json({ message: "Agence invalide ou inactive" }, { status: 400 });
  }
  const agenceCode = agence.code;

  const produits = await listProduits();
  const produitCodes = new Set(produits.filter((p) => p.actif).map((p) => p.code));
  const invalidProduits = parsed.data.produitsAutorises.filter((code) => !produitCodes.has(code.trim().toUpperCase()));
  if (invalidProduits.length > 0) {
    return NextResponse.json(
      { message: `Produits invalides: ${invalidProduits.join(", ")}` },
      { status: 400 },
    );
  }
  if (parsed.data.statutBancarisation === "BANCARISE" && !parsed.data.compteBancaire) {
    return NextResponse.json(
      { message: "Le numero de compte bancaire est requis pour le statut BANCARISE." },
      { status: 400 },
    );
  }

  await ensureConcessionnaireIndexes();

  const doc = await createConcessionnaire({
    nomComplet: parsed.data.nomComplet,
    cniNumero: parsed.data.cniNumero ?? null,
    photoUrl: parsed.data.photoUrl ?? null,
    email: parsed.data.email ?? null,
    telephonePrincipal: parsed.data.telephonePrincipal ?? null,
    telephoneSecondaire: parsed.data.telephoneSecondaire ?? null,
    adresse: parsed.data.adresse ?? null,
    ville: parsed.data.ville ?? null,
    codePostal: parsed.data.codePostal ?? null,
    agenceId,
    agenceCode,
    produitsAutorises: parsed.data.produitsAutorises.map((code) => code.trim().toUpperCase()),
    statut: parsed.data.statut,
    statutBancarisation: parsed.data.statutBancarisation,
    compteBancaire: parsed.data.compteBancaire ?? null,
    banqueEtablissement: parsed.data.banqueEtablissement ?? null,
    gps: parsed.data.gps,
    observations: parsed.data.observations ?? null,
    notesInternes: parsed.data.notesInternes ?? null,
    createdByUserId: auth.user._id ?? "",
  });

  return NextResponse.json({ concessionnaire: sanitizeConcessionnairePublic(doc) }, { status: 201 });
}
