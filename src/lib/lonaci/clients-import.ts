import "server-only";

import {
  canCreateConcessionnaireForAgence,
} from "@/lib/lonaci/access";
import {
  clientCodeSuffix,
  normalizeClientCategorie,
  normalizeClientTypeDistributeur,
  remapClientCodeToAgence,
  type ClientCategorie,
} from "@/lib/lonaci/client-constants";
import {
  mapClientImportRowFromRecord,
  listImportRowHeaders,
  matchAgenceFromImportToken,
  inferAgenceCodeFromClientCode,
  parseNombreTpm,
  resolveImportClientCode,
  resolveImportCniNumero,
  resolveImportNomComplet,
} from "@/lib/lonaci/clients-import-map";
import { createClient, findClientByAgenceAndCode, updateClient } from "@/lib/lonaci/clients";
import { normalizeProduitsAutorises } from "@/lib/lonaci/produit-autorises-validation";
import { findInvalidProduitAutorisesCodes } from "@/lib/lonaci/produit-autorises-validation.server";
import { listAgences } from "@/lib/lonaci/referentials";
import type { AgenceDocument, UserDocument } from "@/lib/lonaci/types";
import { prisma } from "@/lib/prisma";

export type ClientImportRowInput = Record<string, unknown>;

export type NormalizedClientImportRow = {
  code: string;
  categorie: ClientCategorie;
  nomComplet: string;
  raisonSociale: string;
  codeMachine: string | null;
  cniNumero: string;
  nomContact: string | null;
  email: string | null;
  telephone: string | null;
  adresse: string | null;
  ville: string | null;
  codePostal: string | null;
  typeDistributeur: string | null;
  nombreTpm: number | null;
  numeroDistributeur: string | null;
  numeroTpm: string | null;
  agenceRaw: string;
  produitsAutorises: string[];
  notes: string | null;
};

export type ClientImportRowResult = {
  row: number;
  ok: boolean;
  code?: string;
  clientId?: string;
  error?: string;
};

export type ClientImportSummary = {
  inserted: number;
  updated: number;
  /** Lignes déjà à jour (réimport sans changement). */
  unchanged: number;
  /** Alias de `unchanged` (compat). */
  skippedDuplicates: number;
  failed: number;
  results: ClientImportRowResult[];
};

function parseProduits(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" || typeof item === "number" ? String(item).trim() : ""))
      .map((item) => item.toUpperCase())
      .filter(Boolean);
  }
  const raw = typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
  if (!raw) return [];
  return raw
    .split(/[,;|/]/)
    .map((part) => part.trim().toUpperCase())
    .filter(Boolean);
}

/** Normalise une ligne Excel/CSV/JSON sans accès base. */
export function normalizeClientImportRow(
  row: ClientImportRowInput,
  rowNumber = 2,
): { ok: true; value: NormalizedClientImportRow } | { ok: false; error: string } {
  const mapped = mapClientImportRowFromRecord(row);
  const code = resolveImportClientCode(mapped, rowNumber);
  if (!code) return { ok: false, error: "code requis" };

  const cniNumero = resolveImportCniNumero(mapped, code);
  if (cniNumero.length < 4) {
    return { ok: false, error: "cniNumero requis (au moins 4 caractères)" };
  }

  const categorieRaw = mapped.categorie;
  if (categorieRaw) {
    const upper = categorieRaw.toUpperCase();
    if (upper !== "PARTICULIER" && upper !== "ENTREPRISE") {
      return { ok: false, error: "categorie invalide (PARTICULIER|ENTREPRISE)" };
    }
  }
  const categorie: ClientCategorie = categorieRaw
    ? normalizeClientCategorie(categorieRaw)
    : "PARTICULIER";

  const nomComplet = resolveImportNomComplet(mapped, row);
  const raisonSocialeRaw = mapped.raisonSociale.trim();

  if (categorie === "ENTREPRISE") {
    if (raisonSocialeRaw.length < 2) {
      return { ok: false, error: "raisonSociale obligatoire pour ENTREPRISE" };
    }
  } else if (nomComplet.length < 2) {
    const headers = listImportRowHeaders(row);
    return {
      ok: false,
      error: headers
        ? `nomComplet introuvable (colonnes vues: ${headers})`
        : "nomComplet obligatoire pour PARTICULIER (ajoutez une colonne Nom / Nom complet)",
    };
  }

  /** Peut être vide si l’import force une agence via options.agenceId. */
  const agenceRaw = mapped.agence;

  const resolvedNomComplet =
    categorie === "ENTREPRISE"
      ? mapped.nomComplet.trim().length >= 2
        ? mapped.nomComplet.trim()
        : nomComplet.length >= 2
          ? nomComplet
          : raisonSocialeRaw
      : nomComplet;
  const resolvedRaisonSociale =
    categorie === "ENTREPRISE"
      ? raisonSocialeRaw
      : raisonSocialeRaw.length >= 2
        ? raisonSocialeRaw
        : nomComplet;

  return {
    ok: true,
    value: {
      code,
      categorie,
      nomComplet: resolvedNomComplet,
      raisonSociale: resolvedRaisonSociale,
      codeMachine: mapped.codeMachine,
      cniNumero,
      nomContact: mapped.nomContact?.trim() || null,
      email: mapped.email?.trim() || null,
      telephone: mapped.telephone?.trim() || null,
      adresse: mapped.adresse,
      ville: mapped.ville,
      codePostal: mapped.codePostal,
      typeDistributeur: normalizeClientTypeDistributeur(mapped.typeDistributeur),
      nombreTpm: parseNombreTpm(mapped.nombreTpm),
      numeroDistributeur: mapped.numeroDistributeur,
      numeroTpm: mapped.numeroTpm,
      agenceRaw,
      produitsAutorises: parseProduits(mapped.produitsAutorises),
      notes: mapped.notes,
    },
  };
}

export function resolveAgenceFromImportToken(
  token: string,
  agences: AgenceDocument[],
): AgenceDocument | null {
  return matchAgenceFromImportToken(token, agences);
}

/** Déduit l’agence depuis un code `CLI-{AGENCE}-{suffix}`. */
export function inferAgenceFromClientCode(
  rawCode: string,
  agences: AgenceDocument[],
): AgenceDocument | null {
  const agenceToken = inferAgenceCodeFromClientCode(rawCode);
  if (!agenceToken) return null;
  return resolveAgenceFromImportToken(agenceToken, agences);
}

function mapCreateError(code: string): string {
  switch (code) {
    case "CLIENT_IDENTIFIANT_REQUIS":
      return "CNI invalide";
    case "CLIENT_CODE_INVALID":
      return "Format d’identifiant client invalide";
    case "CLIENT_CODE_AGENCE_MISMATCH":
      return "Identifiant incompatible avec l’agence";
    case "CLIENT_CODE_DEJA_UTILISE":
      return "Identifiant déjà utilisé";
    case "AGENCE_REQUIRED":
      return "Agence manquante";
    default:
      return code || "Création impossible";
  }
}

async function upsertExistingClientFromImport(
  existing: {
    id: string;
    code: string;
    categorie: string;
    nomComplet: string | null;
    raisonSociale: string;
    codeMachine: string | null;
    cniNumero: string | null;
    nomContact: string | null;
    email: string | null;
    telephone: string | null;
    adresse: string | null;
    ville: string | null;
    codePostal: string | null;
    typeDistributeur: string | null;
    nombreTpm: number | null;
    numeroDistributeur: string | null;
    numeroTpm: string | null;
    agenceId: string | null;
    produitsAutorises: string[];
    notes: string | null;
  },
  value: NormalizedClientImportRow,
  actor: UserDocument,
  opts: {
    forcedProduit: string | null;
    forcedAgenceId: string | null;
    /** Code normalisé pour l’agence cible (ex. CLI-ABOBO-0001). */
    targetCode: string | null;
  },
): Promise<"updated" | "unchanged"> {
  const sameText = (a: string | null | undefined, b: string | null | undefined) =>
    (a ?? "").trim() === (b ?? "").trim();

  const nextProduits = normalizeProduitsAutorises([
    ...(existing.produitsAutorises ?? []),
    ...(opts.forcedProduit ? [opts.forcedProduit] : value.produitsAutorises),
  ]);
  const existingProduits = normalizeProduitsAutorises(existing.produitsAutorises ?? []);
  const produitsChanged =
    [...nextProduits].sort().join("|") !== [...existingProduits].sort().join("|");

  const patch: Parameters<typeof updateClient>[1] = {};

  if (value.categorie !== existing.categorie) patch.categorie = value.categorie;
  if (!sameText(value.nomComplet, existing.nomComplet)) patch.nomComplet = value.nomComplet;
  if (!sameText(value.raisonSociale, existing.raisonSociale)) {
    patch.raisonSociale = value.raisonSociale;
  }
  if (value.codeMachine !== null && !sameText(value.codeMachine, existing.codeMachine)) {
    patch.codeMachine = value.codeMachine;
  }
  if (!sameText(value.cniNumero, existing.cniNumero)) patch.cniNumero = value.cniNumero;
  if (value.nomContact !== null && !sameText(value.nomContact, existing.nomContact)) {
    patch.nomContact = value.nomContact;
  }
  if (value.email !== null && !sameText(value.email, existing.email)) {
    patch.email = value.email;
  }
  if (value.telephone !== null && !sameText(value.telephone, existing.telephone)) {
    patch.telephone = value.telephone;
  }
  if (value.adresse !== null && !sameText(value.adresse, existing.adresse)) {
    patch.adresse = value.adresse;
  }
  if (value.ville !== null && !sameText(value.ville, existing.ville)) {
    patch.ville = value.ville;
  }
  if (value.codePostal !== null && !sameText(value.codePostal, existing.codePostal)) {
    patch.codePostal = value.codePostal;
  }
  if (value.typeDistributeur !== null) {
    const nextType = normalizeClientTypeDistributeur(value.typeDistributeur);
    const currentType = normalizeClientTypeDistributeur(existing.typeDistributeur);
    if (nextType !== currentType) {
      patch.typeDistributeur = value.typeDistributeur;
    }
  }
  if (value.nombreTpm !== null && value.nombreTpm !== existing.nombreTpm) {
    patch.nombreTpm = value.nombreTpm;
  }
  if (
    value.numeroDistributeur !== null &&
    !sameText(value.numeroDistributeur, existing.numeroDistributeur)
  ) {
    patch.numeroDistributeur = value.numeroDistributeur;
  }
  if (value.numeroTpm !== null && !sameText(value.numeroTpm, existing.numeroTpm)) {
    patch.numeroTpm = value.numeroTpm;
  }
  if (value.notes !== null && !sameText(value.notes, existing.notes)) {
    patch.notes = value.notes;
  }
  if (produitsChanged) patch.produitsAutorises = nextProduits;

  const targetAgenceId = opts.forcedAgenceId;
  if (targetAgenceId && existing.agenceId !== targetAgenceId) {
    patch.agenceId = targetAgenceId;
  }
  if (opts.targetCode && existing.code.trim().toUpperCase() !== opts.targetCode) {
    patch.code = opts.targetCode;
  }

  if (Object.keys(patch).length === 0) return "unchanged";

  if (patch.agenceId || patch.code) {
    const nextAgenceId = (patch.agenceId ?? existing.agenceId ?? "").trim();
    const nextCode = (patch.code ?? existing.code).trim().toUpperCase();
    if (nextAgenceId && nextCode) {
      const clash = await findClientByAgenceAndCode(nextAgenceId, nextCode);
      if (clash && clash.id !== existing.id && !clash.deletedAt) {
        throw new Error("CLIENT_CODE_DEJA_UTILISE");
      }
    }
  }

  await updateClient(existing.id, patch, actor);
  return "updated";
}

const existingClientSelect = {
  id: true,
  code: true,
  categorie: true,
  nomComplet: true,
  raisonSociale: true,
  codeMachine: true,
  cniNumero: true,
  nomContact: true,
  email: true,
  telephone: true,
  adresse: true,
  ville: true,
  codePostal: true,
  typeDistributeur: true,
  nombreTpm: true,
  numeroDistributeur: true,
  numeroTpm: true,
  agenceId: true,
  produitsAutorises: true,
  notes: true,
} as const;

type ExistingClientRow = {
  id: string;
  code: string;
  categorie: string;
  nomComplet: string | null;
  raisonSociale: string;
  codeMachine: string | null;
  cniNumero: string | null;
  nomContact: string | null;
  email: string | null;
  telephone: string | null;
  adresse: string | null;
  ville: string | null;
  codePostal: string | null;
  typeDistributeur: string | null;
  nombreTpm: number | null;
  numeroDistributeur: string | null;
  numeroTpm: string | null;
  agenceId: string | null;
  produitsAutorises: string[];
  notes: string | null;
};

/**
 * Cherche un client déjà connu pour une ligne d’import.
 * Avec agence forcée : recherche aussi hors agence (CNI / même suffixe de code)
 * pour pouvoir réaffecter les fiches mal classées.
 */
async function findExistingClientForImport(params: {
  agenceId: string;
  fullCode: string;
  cniNumero: string;
  allowCrossAgence: boolean;
}): Promise<ExistingClientRow | null> {
  const { agenceId, fullCode, cniNumero, allowCrossAgence } = params;

  const byAgenceCode = await findClientByAgenceAndCode(agenceId, fullCode);
  if (byAgenceCode && !byAgenceCode.deletedAt) {
    return byAgenceCode as ExistingClientRow;
  }

  const byCniSame = await prisma.lonaciClient.findFirst({
    where: {
      agenceId,
      cniNumero,
      deletedAt: null,
    },
    select: existingClientSelect,
  });
  if (byCniSame) return byCniSame;

  const orphanByCode = await prisma.lonaciClient.findFirst({
    where: {
      deletedAt: null,
      code: fullCode,
      OR: [{ agenceId: null }, { agenceId: "" }],
    },
    select: existingClientSelect,
  });
  const orphan =
    orphanByCode ??
    (await prisma.lonaciClient.findFirst({
      where: {
        deletedAt: null,
        cniNumero,
        OR: [{ agenceId: null }, { agenceId: "" }],
      },
      select: existingClientSelect,
    }));
  if (orphan) return orphan;

  if (!allowCrossAgence) return null;

  const byCniAny = await prisma.lonaciClient.findFirst({
    where: { deletedAt: null, cniNumero },
    select: existingClientSelect,
  });
  if (byCniAny) return byCniAny;

  const byExactCodeAny = await prisma.lonaciClient.findFirst({
    where: { deletedAt: null, code: fullCode },
    select: existingClientSelect,
  });
  if (byExactCodeAny) return byExactCodeAny;

  const suffix = clientCodeSuffix(fullCode);
  if (!suffix) return null;

  const candidates = await prisma.lonaciClient.findMany({
    where: {
      deletedAt: null,
      code: { endsWith: `-${suffix}` },
    },
    select: existingClientSelect,
    take: 40,
  });
  const match = candidates.find((row) => clientCodeSuffix(row.code) === suffix);
  return match ?? null;
}

export async function importClientsFromRows(
  rows: ClientImportRowInput[],
  actor: UserDocument,
  options?: { produitCode?: string | null; agenceId?: string | null },
): Promise<ClientImportSummary> {
  const agences = (await listAgences()).filter((a) => a.actif && a.code.trim().length >= 2);
  const results: ClientImportRowResult[] = [];
  let inserted = 0;
  let updated = 0;
  let unchanged = 0;
  let failed = 0;
  const forcedProduit = options?.produitCode?.trim().toUpperCase() || null;
  const forcedAgenceId = options?.agenceId?.trim() || null;
  const forcedAgence = forcedAgenceId
    ? agences.find((a) => a._id === forcedAgenceId) ?? null
    : null;
  if (forcedAgenceId && (!forcedAgence || !forcedAgence._id)) {
    return {
      inserted: 0,
      updated: 0,
      unchanged: 0,
      skippedDuplicates: 0,
      failed: rows.length,
      results: [
        {
          row: 0,
          ok: false,
          error: `Agence d’import introuvable ou inactive: ${forcedAgenceId}`,
        },
      ],
    };
  }
  if (forcedProduit) {
    const invalidForced = await findInvalidProduitAutorisesCodes([forcedProduit]);
    if (invalidForced.length > 0) {
      return {
        inserted: 0,
        updated: 0,
        unchanged: 0,
        skippedDuplicates: 0,
        failed: rows.length,
        results: [
          {
            row: 0,
            ok: false,
            error: `Produit d’import invalide: ${forcedProduit}`,
          },
        ],
      };
    }
  }

  for (let index = 0; index < rows.length; index += 1) {
    const rowNumber = index + 2; // +1 header Excel convention
    const raw = rows[index] ?? {};
    const normalized = normalizeClientImportRow(raw, rowNumber);
    if (!normalized.ok) {
      failed += 1;
      results.push({ row: rowNumber, ok: false, error: normalized.error });
      continue;
    }

    const value = normalized.value;
    // Priorité : colonne agence du fichier → préfixe CLI-{AGENCE}- → agence de secours (options).
    const agence =
      resolveAgenceFromImportToken(value.agenceRaw, agences) ??
      inferAgenceFromClientCode(value.code, agences) ??
      forcedAgence;
    if (!agence || !agence._id) {
      failed += 1;
      results.push({
        row: rowNumber,
        ok: false,
        error: value.agenceRaw
          ? `Agence introuvable ou inactive: ${value.agenceRaw}`
          : "agence introuvable (renseignez la colonne Agence ou un code CLI-{AGENCE}-…)",
      });
      continue;
    }

    if (!canCreateConcessionnaireForAgence(actor, agence._id)) {
      failed += 1;
      results.push({
        row: rowNumber,
        ok: false,
        error: "Accès refusé pour cette agence",
      });
      continue;
    }

    let fullCode: string;
    try {
      // Toujours aligner le code sur l’agence résolue pour la ligne (tri multi-agences).
      fullCode = remapClientCodeToAgence(value.code, agence.code);
    } catch (error) {
      failed += 1;
      results.push({
        row: rowNumber,
        ok: false,
        error: mapCreateError(error instanceof Error ? error.message : "CLIENT_CODE_INVALID"),
      });
      continue;
    }

    const existing = await findExistingClientForImport({
      agenceId: agence._id,
      fullCode,
      cniNumero: value.cniNumero,
      // Réaffecte les fiches déjà créées sous une autre agence vers celle du fichier.
      allowCrossAgence: true,
    });

    if (existing) {
      try {
        const outcome = await upsertExistingClientFromImport(existing, value, actor, {
          forcedProduit,
          forcedAgenceId: agence._id,
          targetCode: fullCode,
        });
        if (outcome === "updated") updated += 1;
        else unchanged += 1;
        results.push({
          row: rowNumber,
          ok: true,
          code: fullCode,
          clientId: existing.id,
        });
      } catch (error) {
        failed += 1;
        results.push({
          row: rowNumber,
          ok: false,
          error: mapCreateError(error instanceof Error ? error.message : "UNKNOWN"),
        });
      }
      continue;
    }

    const produitsAutorises = normalizeProduitsAutorises(
      forcedProduit ? [forcedProduit] : value.produitsAutorises,
    );
    const invalidProduits = await findInvalidProduitAutorisesCodes(produitsAutorises);
    if (invalidProduits.length > 0) {
      failed += 1;
      results.push({
        row: rowNumber,
        ok: false,
        error: `Produits invalides: ${invalidProduits.join(", ")}`,
      });
      continue;
    }

    if (value.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)) {
      failed += 1;
      results.push({ row: rowNumber, ok: false, error: "email invalide" });
      continue;
    }

    try {
      const created = await createClient(
        {
          // Toujours le code déjà normalisé pour l’agence cible (évite CLI-AUTRE-… sous une autre agence).
          code: fullCode,
          agenceCode: agence.code,
          categorie: value.categorie,
          nomComplet: value.nomComplet,
          raisonSociale: value.raisonSociale,
          codeMachine: value.codeMachine,
          cniNumero: value.cniNumero,
          nomContact: value.nomContact,
          email: value.email,
          telephone: value.telephone,
          adresse: value.adresse,
          ville: value.ville,
          codePostal: value.codePostal,
          typeDistributeur: value.typeDistributeur,
          nombreTpm: value.nombreTpm,
          numeroDistributeur: value.numeroDistributeur,
          numeroTpm: value.numeroTpm,
          agenceId: agence._id,
          produitsAutorises,
          notes: value.notes,
        },
        actor,
      );
      inserted += 1;
      results.push({
        row: rowNumber,
        ok: true,
        code: created.code,
        clientId: created.id,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "UNKNOWN";
      if (message === "CLIENT_CODE_DEJA_UTILISE" || message.includes("E11000")) {
        const raced = await findExistingClientForImport({
          agenceId: agence._id,
          fullCode,
          cniNumero: value.cniNumero,
          allowCrossAgence: true,
        });
        if (raced) {
          try {
            const outcome = await upsertExistingClientFromImport(raced, value, actor, {
              forcedProduit,
              forcedAgenceId: agence._id,
              targetCode: fullCode,
            });
            if (outcome === "updated") updated += 1;
            else unchanged += 1;
            results.push({
              row: rowNumber,
              ok: true,
              code: fullCode,
              clientId: raced.id,
            });
            continue;
          } catch (upsertError) {
            failed += 1;
            results.push({
              row: rowNumber,
              ok: false,
              error: mapCreateError(
                upsertError instanceof Error ? upsertError.message : "UNKNOWN",
              ),
            });
            continue;
          }
        }
        unchanged += 1;
        results.push({
          row: rowNumber,
          ok: true,
          code: fullCode,
        });
        continue;
      }
      failed += 1;
      results.push({
        row: rowNumber,
        ok: false,
        error: mapCreateError(message),
      });
    }
  }

  return {
    inserted,
    updated,
    unchanged,
    skippedDuplicates: unchanged,
    failed,
    results,
  };
}
