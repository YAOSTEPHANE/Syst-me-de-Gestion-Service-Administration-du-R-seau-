import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { badRequest, conflict, forbidden } from "@/lib/api/error-responses";
import { zodBadRequest } from "@/lib/api/endpoint-helpers";
import { requireListAgenceScope, listAgenceScopeFields } from "@/lib/api/list-agence-scope";
import {
  canCreateConcessionnaireForAgence,
  enforcedAgenceIdOnCreate,
} from "@/lib/lonaci/access";
import {
  BANCARISATION_STATUTS,
  CONCESSIONNAIRE_INSCRIPTION_STATUTS,
  CONCESSIONNAIRE_STATUTS,
} from "@/lib/lonaci/constants";
import {
  ensureConcessionnaireIndexes,
  sanitizeConcessionnaireListItem,
  sanitizeConcessionnairePublic,
  searchConcessionnaires,
} from "@/lib/lonaci/concessionnaires";
import { createConcessionnaireFromClient } from "@/lib/lonaci/client-to-concessionnaire";
import { findAgenceById, listProduits } from "@/lib/lonaci/referentials";
import { requireApiAuth } from "@/lib/auth/guards";

const OTHER_PRODUCT_CODE = "AUTRES";

function emptyStringToNull(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function normalizeToken(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[\s/-]+/g, "_");
}

const createSchema = z
  .object({
  nom: z.preprocess(emptyStringToNull, z.union([z.string().min(2), z.null()]).optional()),
  prenom: z.preprocess(emptyStringToNull, z.union([z.string().min(2), z.null()]).optional()),
  nomComplet: z.preprocess(emptyStringToNull, z.union([z.string().min(2), z.null()]).optional()),
  codeTerminal: z.preprocess(emptyStringToNull, z.union([z.string().min(1).max(64), z.null()]).optional()),
  codeConcessionnaire: z.preprocess(emptyStringToNull, z.union([z.string().min(1).max(64), z.null()]).optional()),
  cniNumero: z.preprocess(emptyStringToNull, z.union([z.string().min(4).max(64), z.null()]).optional()),
  photoUrl: z.preprocess(emptyStringToNull, z.union([z.string().max(2000), z.null()]).optional()),
  email: z.preprocess(emptyStringToNull, z.union([z.string().email(), z.null()]).optional()),
  telephonePrincipal: z.preprocess(
    emptyStringToNull,
    z.union([z.string().min(8).max(32), z.null()]).optional(),
  ),
  telephoneSecondaire: z.preprocess(
    emptyStringToNull,
    z.union([z.string().min(8).max(32), z.null()]).optional(),
  ),
  adresse: z.preprocess(emptyStringToNull, z.union([z.string().max(500), z.null()]).optional()),
  ville: z.preprocess(emptyStringToNull, z.union([z.string().max(120), z.null()]).optional()),
  codePostal: z.preprocess(emptyStringToNull, z.union([z.string().max(12), z.null()]).optional()),
  agenceId: z.preprocess(emptyStringToNull, z.union([z.string().min(1), z.null()]).optional()),
  produitsAutorises: z.array(z.string().min(1)).default([]),
  statut: z.enum(CONCESSIONNAIRE_STATUTS).optional(),
  statutBancarisation: z.enum(BANCARISATION_STATUTS).default("NON_BANCARISE"),
  compteBancaire: z.preprocess(emptyStringToNull, z.union([z.string().max(128), z.null()]).optional()),
  banqueEtablissement: z.preprocess(emptyStringToNull, z.union([z.string().max(200), z.null()]).optional()),
  gps: z.object({
    lat: z.coerce.number().gte(-90).lte(90),
    lng: z.coerce.number().gte(-180).lte(180),
  }),
  /** Client Lonaci ayant terminé son parcours (statut ACTIF). */
  sourceLonaciClientId: z.string().min(1),
  observations: z.preprocess(emptyStringToNull, z.union([z.string().max(10000), z.null()]).optional()),
  notesInternes: z.preprocess(emptyStringToNull, z.union([z.string().max(10000), z.null()]).optional()),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().optional(),
  statut: z.enum(CONCESSIONNAIRE_STATUTS).optional(),
  inscriptionStatut: z.enum(CONCESSIONNAIRE_INSCRIPTION_STATUTS).optional(),
  inscriptionFinaliseeOnly: z.enum(["true", "false"]).optional(),
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
    return zodBadRequest(parsed.error, "Parametres invalides");
  }

  const includeDeleted =
    parsed.data.includeDeleted === "true" && auth.user.role === "CHEF_SERVICE";

  await ensureConcessionnaireIndexes();
  const agenceScope = requireListAgenceScope(auth.user, parsed.data.agenceId);
  if (!agenceScope.ok) return agenceScope.response;
  const result = await searchConcessionnaires({
    page: parsed.data.page,
    pageSize: parsed.data.pageSize,
    q: parsed.data.q,
    statut: parsed.data.statut,
    inscriptionStatut: parsed.data.inscriptionStatut,
    inscriptionFinaliseeOnly: parsed.data.inscriptionFinaliseeOnly === "true",
    statutBancarisation: parsed.data.statutBancarisation,
    produitCode: parsed.data.produitCode,
    ...listAgenceScopeFields(agenceScope),
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
    return zodBadRequest(parsed.error);
  }

  const requestedAgenceId =
    parsed.data.agenceId === undefined ? null : parsed.data.agenceId;
  const agenceId = enforcedAgenceIdOnCreate(auth.user, requestedAgenceId);

  if (!agenceId) {
    if (
      (auth.user.role === "AGENT" || auth.user.role === "CHEF_SECTION") &&
      auth.user.agencesAutorisees.length > 1
    ) {
      return badRequest(
        "Selectionnez une agence de rattachement autorisee avant creation du concessionnaire.",
        "AGENCE_SELECTION_REQUIRED",
      );
    }
    return badRequest(
      "Agence de rattachement obligatoire pour attribuer le code PDV.",
      "AGENCE_REQUIRED",
    );
  }

  const agence = await findAgenceById(agenceId);
  if (!agence || !agence.actif || !agence.code) {
    return badRequest("Agence invalide ou inactive", "AGENCE_INVALID");
  }
  const agenceCode = agence.code.trim().toUpperCase();

  if (!canCreateConcessionnaireForAgence(auth.user, agenceId)) {
    // Compat legacy: agencesAutorisees peut contenir id, code agence ou libellé.
    const agenceTokenSet = new Set<string>([
      normalizeToken(agenceId),
      normalizeToken(agenceCode),
      normalizeToken(agence.libelle),
    ]);
    const authorizedByLegacyValue = auth.user.agencesAutorisees.some((value) =>
      agenceTokenSet.has(normalizeToken(value)),
    );
    if (!authorizedByLegacyValue) {
      return forbidden("Acces refuse pour cette agence", "AGENCE_FORBIDDEN");
    }
  }

  const produits = await listProduits();
  const produitCodes = new Set(produits.filter((p) => p.actif).map((p) => p.code));
  const invalidProduits = parsed.data.produitsAutorises.filter((code) => {
    const normalized = code.trim().toUpperCase();
    if (normalized === OTHER_PRODUCT_CODE) return false;
    return !produitCodes.has(normalized);
  });
  if (invalidProduits.length > 0) {
    return badRequest(`Produits invalides: ${invalidProduits.join(", ")}`, "INVALID_PRODUCTS");
  }
  if (parsed.data.statutBancarisation === "BANCARISE" && !parsed.data.compteBancaire) {
    return badRequest(
      "Le numero de compte bancaire est requis pour le statut BANCARISE.",
      "BANK_ACCOUNT_REQUIRED",
    );
  }

  await ensureConcessionnaireIndexes();

  try {
    const doc = await createConcessionnaireFromClient({
      sourceLonaciClientId: parsed.data.sourceLonaciClientId.trim(),
      agenceId,
      agenceCode,
      codeTerminal: parsed.data.codeTerminal ?? null,
      codeConcessionnaire: parsed.data.codeConcessionnaire ?? null,
      gps: parsed.data.gps,
      statutBancarisation: parsed.data.statutBancarisation,
      compteBancaire: parsed.data.compteBancaire ?? null,
      banqueEtablissement: parsed.data.banqueEtablissement ?? null,
      observations: parsed.data.observations ?? null,
      notesInternes: parsed.data.notesInternes ?? null,
      actor: auth.user,
    });
    return NextResponse.json({ concessionnaire: sanitizeConcessionnairePublic(doc) }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "CLIENT_NOT_FOUND") {
      return badRequest("Client introuvable.", "CLIENT_NOT_FOUND");
    }
    if (code === "CLIENT_INSCRIPTION_PENDING") {
      return conflict("Validation N1 client requise.", "CLIENT_INSCRIPTION_PENDING");
    }
    if (code === "CLIENT_PARCOURS_INCOMPLET") {
      return conflict(
        "Le client doit terminer son parcours (caution payee, statut actif) avant promotion PDV.",
        "CLIENT_PARCOURS_INCOMPLET",
      );
    }
    if (code === "CLIENT_ALREADY_PROMOTED") {
      return conflict("Ce client est deja rattache a un concessionnaire.", "CLIENT_ALREADY_PROMOTED");
    }
    if (code === "CLIENT_BLOQUE") {
      return conflict("Client non eligible.", "CLIENT_BLOQUE");
    }
    return badRequest("Creation du concessionnaire impossible.", "CONCESSIONNAIRE_CREATE_FAILED");
  }
}
