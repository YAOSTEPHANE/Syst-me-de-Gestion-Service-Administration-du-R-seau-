import "server-only";

import {
  canCreateConcessionnaireForAgence,
  normalizeAgenceScopeToken,
} from "@/lib/lonaci/access";
import {
  normalizeClientCategorie,
  normalizeClientCodeForAgence,
  normalizeClientTypeConcession,
  type ClientCategorie,
} from "@/lib/lonaci/client-constants";
import {
  mapClientImportRowFromRecord,
  listImportRowHeaders,
  parseNombreTpm,
  resolveImportClientCode,
  resolveImportCniNumero,
  resolveImportNomComplet,
} from "@/lib/lonaci/clients-import-map";
import { createClient, findClientByAgenceAndCode } from "@/lib/lonaci/clients";
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
  typeConcession: string | null;
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

  const agenceRaw = mapped.agence;
  if (!agenceRaw) return { ok: false, error: "agence requise (code, libellé ou id)" };

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
      nomContact: mapped.nomContact,
      email: mapped.email,
      telephone: mapped.telephone,
      adresse: mapped.adresse,
      ville: mapped.ville,
      codePostal: mapped.codePostal,
      typeConcession: normalizeClientTypeConcession(mapped.typeConcession),
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
  const normalized = normalizeAgenceScopeToken(token);
  if (!normalized) return null;
  return (
    agences.find((a) => a._id && normalizeAgenceScopeToken(a._id) === normalized) ??
    agences.find((a) => normalizeAgenceScopeToken(a.code) === normalized) ??
    agences.find((a) => normalizeAgenceScopeToken(a.libelle) === normalized) ??
    null
  );
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

export async function importClientsFromRows(
  rows: ClientImportRowInput[],
  actor: UserDocument,
  options?: { produitCode?: string | null },
): Promise<ClientImportSummary> {
  const agences = (await listAgences()).filter((a) => a.actif && a.code.trim().length >= 2);
  const results: ClientImportRowResult[] = [];
  let inserted = 0;
  let skippedDuplicates = 0;
  let failed = 0;
  const forcedProduit = options?.produitCode?.trim().toUpperCase() || null;
  if (forcedProduit) {
    const invalidForced = await findInvalidProduitAutorisesCodes([forcedProduit]);
    if (invalidForced.length > 0) {
      return {
        inserted: 0,
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
    const agence = resolveAgenceFromImportToken(value.agenceRaw, agences);
    if (!agence || !agence._id) {
      failed += 1;
      results.push({
        row: rowNumber,
        ok: false,
        error: `Agence introuvable ou inactive: ${value.agenceRaw}`,
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
      fullCode = normalizeClientCodeForAgence(value.code, agence.code);
    } catch (error) {
      failed += 1;
      results.push({
        row: rowNumber,
        ok: false,
        error: mapCreateError(error instanceof Error ? error.message : "CLIENT_CODE_INVALID"),
      });
      continue;
    }

    const existingByCode = await findClientByAgenceAndCode(agence._id, fullCode);
    if (existingByCode && !existingByCode.deletedAt) {
      skippedDuplicates += 1;
      results.push({
        row: rowNumber,
        ok: false,
        code: fullCode,
        error: "Doublon (code déjà présent) — ligne ignorée",
      });
      continue;
    }

    const existingByCni = await prisma.lonaciClient.findFirst({
      where: {
        agenceId: agence._id,
        cniNumero: value.cniNumero,
        deletedAt: null,
      },
      select: { id: true, code: true },
    });
    if (existingByCni) {
      skippedDuplicates += 1;
      results.push({
        row: rowNumber,
        ok: false,
        code: existingByCni.code,
        error: "Doublon (CNI déjà présent) — ligne ignorée",
      });
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
          code: value.code,
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
          typeConcession: value.typeConcession,
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
        skippedDuplicates += 1;
        results.push({
          row: rowNumber,
          ok: false,
          code: fullCode,
          error: "Doublon (code déjà présent) — ligne ignorée",
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

  return { inserted, skippedDuplicates, failed, results };
}
