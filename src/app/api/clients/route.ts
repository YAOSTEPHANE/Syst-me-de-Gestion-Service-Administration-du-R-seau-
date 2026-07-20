import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { badRequest, forbidden } from "@/lib/api/error-responses";
import { zodBadRequest } from "@/lib/api/endpoint-helpers";
import {
  buildClientAgenceReadScopeWhere,
  canCreateConcessionnaireForAgence,
  enforcedAgenceIdOnCreate,
  resolveListAgenceFilter,
} from "@/lib/lonaci/access";
import { CLIENT_STATUTS, CLIENT_CATEGORIES } from "@/lib/lonaci/client-constants";
import {
  createClient,
  sanitizeClientPublic,
  searchClients,
} from "@/lib/lonaci/clients";
import { findAgenceById } from "@/lib/lonaci/referentials";
import {
  normalizeProduitsAutorises,
} from "@/lib/lonaci/produit-autorises-validation";
import { findInvalidProduitAutorisesCodes } from "@/lib/lonaci/produit-autorises-validation.server";
import { requireApiAuth } from "@/lib/auth/guards";

const documentChecklistPatchSchema = z.array(
  z.object({
    itemId: z.string().min(1),
    statut: z.enum(["FOURNI", "MANQUANT", "EN_ATTENTE"]),
  }),
);

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

const createSchema = z.object({
  code: z.string().trim().min(1).max(64),
  categorie: z.enum(CLIENT_CATEGORIES).default("PARTICULIER"),
  nomComplet: z.string().min(2).max(200).optional(),
  raisonSociale: z.preprocess(
    emptyStringToNull,
    z.union([z.string().min(2).max(300), z.null()]).optional(),
  ),
  cniNumero: z.string().trim().min(4).max(64),
  nomContact: z.preprocess(emptyStringToNull, z.union([z.string().min(2).max(200), z.null()]).optional()),
  email: z.preprocess(emptyStringToNull, z.union([z.string().email(), z.null()]).optional()),
  telephone: z.preprocess(emptyStringToNull, z.union([z.string().min(6).max(32), z.null()]).optional()),
  adresse: z.preprocess(emptyStringToNull, z.union([z.string().max(500), z.null()]).optional()),
  ville: z.preprocess(emptyStringToNull, z.union([z.string().max(120), z.null()]).optional()),
  codePostal: z.preprocess(emptyStringToNull, z.union([z.string().max(12), z.null()]).optional()),
  agenceId: z.preprocess(emptyStringToNull, z.union([z.string().min(1), z.null()]).optional()),
  produitsAutorises: z.array(z.string().min(1)).optional().default([]),
  documentChecklist: documentChecklistPatchSchema.optional(),
  notes: z.preprocess(emptyStringToNull, z.union([z.string().max(10000), z.null()]).optional()),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().optional(),
  statut: z.enum(CLIENT_STATUTS).optional(),
  categorie: z.enum(CLIENT_CATEGORIES).optional(),
  eligibleForCaution: z.enum(["true", "false"]).optional(),
  eligibleForContrat: z.enum(["true", "false"]).optional(),
  eligibleForPromotion: z.enum(["true", "false"]).optional(),
  linkedToConcessionnaire: z.enum(["true", "false"]).optional(),
  agenceId: z.string().optional(),
  includeDeleted: z.enum(["true", "false"]).optional(),
});

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request);
  if ("error" in auth) {
    // #region agent log
    fetch("http://127.0.0.1:27772/ingest/4bb0b21c-00fd-438b-b24a-787fe0e18287", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "669066" },
      body: JSON.stringify({
        sessionId: "669066",
        hypothesisId: "H1",
        location: "api/clients/route.ts:GET",
        message: "clients GET blocked by auth",
        data: { status: auth.error?.status ?? -1 },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    return auth.error;
  }

  const raw = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = listQuerySchema.safeParse(raw);
  if (!parsed.success) {
    // #region agent log
    fetch("http://127.0.0.1:27772/ingest/4bb0b21c-00fd-438b-b24a-787fe0e18287", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "669066" },
      body: JSON.stringify({
        sessionId: "669066",
        hypothesisId: "H1",
        location: "api/clients/route.ts:GET",
        message: "clients GET list query parse failed",
        data: { issues: parsed.error.issues.length },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    return zodBadRequest(parsed.error, "Parametres invalides");
  }

  const includeDeleted =
    parsed.data.includeDeleted === "true" && auth.user.role === "CHEF_SERVICE";

  const agenceScope = resolveListAgenceFilter(auth.user, parsed.data.agenceId);
  if (!agenceScope.ok) {
    return forbidden("Acces refuse pour cette agence.", "AGENCE_FORBIDDEN");
  }
  const clientAgenceFilter =
    agenceScope.agenceIds && agenceScope.agenceIds.length > 1
      ? undefined
      : agenceScope.agenceId;

  const readerScope = await buildClientAgenceReadScopeWhere(auth.user);
  let scopeJson = "";
  try {
    scopeJson = JSON.stringify(readerScope).slice(0, 700);
  } catch {
    scopeJson = "(unserializable)";
  }
  // #region agent log
  fetch("http://127.0.0.1:27772/ingest/4bb0b21c-00fd-438b-b24a-787fe0e18287", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "669066" },
    body: JSON.stringify({
      sessionId: "669066",
      hypothesisId: "H2",
      location: "api/clients/route.ts:GET",
      message: "clients GET readerScope and user scope inputs",
      data: {
        role: auth.user.role,
        hasAgenceId: Boolean(auth.user.agenceId?.trim()),
        agencesAutoriseesLen: auth.user.agencesAutorisees?.length ?? 0,
        readerScopeJson: scopeJson,
        query: { page: parsed.data.page, pageSize: parsed.data.pageSize, statut: parsed.data.statut ?? null },
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  let result: Awaited<ReturnType<typeof searchClients>>;
  try {
    result = await searchClients({
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
      q: parsed.data.q,
      statut: parsed.data.statut,
      categorie: parsed.data.categorie,
      eligibleForCaution: parsed.data.eligibleForCaution === "true",
      eligibleForContrat: parsed.data.eligibleForContrat === "true",
      eligibleForPromotion: parsed.data.eligibleForPromotion === "true",
      linkedToConcessionnaire: parsed.data.linkedToConcessionnaire === "true",
      agenceId: clientAgenceFilter,
      readerScope,
      includeDeleted,
    });
  } catch (err) {
    // #region agent log
    fetch("http://127.0.0.1:27772/ingest/4bb0b21c-00fd-438b-b24a-787fe0e18287", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "669066" },
      body: JSON.stringify({
        sessionId: "669066",
        hypothesisId: "H5",
        location: "api/clients/route.ts:GET",
        message: "clients GET searchClients threw",
        data: { err: err instanceof Error ? err.message : String(err) },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    throw err;
  }

  // #region agent log
  fetch("http://127.0.0.1:27772/ingest/4bb0b21c-00fd-438b-b24a-787fe0e18287", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "669066" },
    body: JSON.stringify({
      sessionId: "669066",
      hypothesisId: "H2",
      location: "api/clients/route.ts:GET",
      message: "clients GET searchClients result",
      data: { total: result.total, itemsLen: result.items.length },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  return NextResponse.json({
    ...result,
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(request);
  if ("error" in auth) {
    return auth.error;
  }

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return zodBadRequest(parsed.error);
  }

  const requestedAgenceId = parsed.data.agenceId === undefined ? null : parsed.data.agenceId;
  const agenceId = enforcedAgenceIdOnCreate(auth.user, requestedAgenceId);

  if (!agenceId) {
    if (
      (auth.user.role === "AGENT" || auth.user.role === "CHEF_SECTION") &&
      auth.user.agencesAutorisees.length > 1
    ) {
      return badRequest(
        "Selectionnez une agence de rattachement autorisee avant creation du client.",
        "AGENCE_SELECTION_REQUIRED",
      );
    }
    return badRequest("Agence de rattachement obligatoire.", "AGENCE_REQUIRED");
  }

  const agence = await findAgenceById(agenceId);
  if (!agence || !agence.actif || !agence.code) {
    return badRequest("Agence invalide ou inactive", "AGENCE_INVALID");
  }
  const agenceCode = agence.code.trim().toUpperCase();

  if (!canCreateConcessionnaireForAgence(auth.user, agenceId)) {
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

  const produitsAutorises = normalizeProduitsAutorises(parsed.data.produitsAutorises ?? []);
  const invalidProduits = await findInvalidProduitAutorisesCodes(produitsAutorises);
  if (invalidProduits.length > 0) {
    return badRequest(`Produits invalides: ${invalidProduits.join(", ")}`, "INVALID_PRODUCTS");
  }

  const categorie = parsed.data.categorie;
  const nomCompletRaw = parsed.data.nomComplet?.trim() ?? "";
  const raisonSocialeRaw = parsed.data.raisonSociale?.trim() ?? "";

  if (categorie === "ENTREPRISE") {
    if (raisonSocialeRaw.length < 2) {
      return badRequest("La raison sociale est obligatoire pour une entreprise.", "CLIENT_RAISON_SOCIALE_REQUISE");
    }
  } else if (nomCompletRaw.length < 2) {
    return badRequest("Le nom complet est obligatoire pour un particulier.", "CLIENT_NOM_COMPLET_REQUIS");
  }

  const raisonSociale =
    categorie === "ENTREPRISE"
      ? raisonSocialeRaw
      : raisonSocialeRaw.length >= 2
        ? raisonSocialeRaw
        : nomCompletRaw;
  const nomComplet =
    categorie === "ENTREPRISE"
      ? nomCompletRaw.length >= 2
        ? nomCompletRaw
        : raisonSociale
      : nomCompletRaw;

  try {
    const row = await createClient(
      {
        code: parsed.data.code,
        agenceCode,
        categorie,
        nomComplet,
        raisonSociale,
        cniNumero: parsed.data.cniNumero.trim(),
        nomContact: parsed.data.nomContact ?? null,
        email: parsed.data.email ?? null,
        telephone: parsed.data.telephone ?? null,
        adresse: parsed.data.adresse ?? null,
        ville: parsed.data.ville ?? null,
        codePostal: parsed.data.codePostal ?? null,
        agenceId,
        produitsAutorises,
        documentChecklist: parsed.data.documentChecklist,
        notes: parsed.data.notes ?? null,
      },
      auth.user,
    );

    return NextResponse.json({ client: sanitizeClientPublic(row) }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message === "CLIENT_IDENTIFIANT_REQUIS") {
      return badRequest("Le numéro CNI (identifiant client) est obligatoire à la création.", "CLIENT_IDENTIFIANT_REQUIS");
    }
    if (message === "CLIENT_CODE_INVALID") {
      return badRequest(
        "Format d’identifiant client invalide (lettres, chiffres, tirets ; 1 à 32 caractères après le code agence).",
        "CLIENT_CODE_INVALID",
      );
    }
    if (message === "CLIENT_CODE_AGENCE_MISMATCH") {
      return badRequest(
        "L’identifiant saisi ne correspond pas à l’agence de rattachement sélectionnée.",
        "CLIENT_CODE_AGENCE_MISMATCH",
      );
    }
    if (message === "CLIENT_CODE_DEJA_UTILISE") {
      return badRequest(
        "Cet identifiant client est déjà utilisé dans cette zone. Choisissez un autre code.",
        "CLIENT_CODE_DEJA_UTILISE",
      );
    }
    if (message.includes("E11000")) {
      return badRequest("Cet identifiant client existe déjà dans cette zone.", "CLIENT_CODE_DEJA_UTILISE");
    }
    throw err;
  }
}
