import "server-only";

import { canCreateConcessionnaireForAgence } from "@/lib/lonaci/access";
import {
  mapAgrementImportRowFromRecord,
  parseAgrementImportDate,
} from "@/lib/lonaci/agrements-import-map";
import { ensureAgrementsIndexes, upsertAgrementFromImport } from "@/lib/lonaci/agrements";
import { matchAgenceFromImportToken } from "@/lib/lonaci/clients-import-map";
import { findInvalidProduitAutorisesCodes } from "@/lib/lonaci/produit-autorises-validation.server";
import { listAgences } from "@/lib/lonaci/referentials";
import type { UserDocument } from "@/lib/lonaci/types";

export type AgrementImportRowInput = Record<string, unknown>;

export type AgrementImportRowResult = {
  row: number;
  ok: boolean;
  reference?: string;
  agrementId?: string;
  error?: string;
};

export type AgrementImportSummary = {
  inserted: number;
  updated: number;
  unchanged: number;
  failed: number;
  results: AgrementImportRowResult[];
};

function isObjectIdLike(value: string): boolean {
  return /^[a-f\d]{24}$/i.test(value.trim());
}

export async function importAgrementsFromRows(
  rows: AgrementImportRowInput[],
  actor: UserDocument,
  options?: { produitCode?: string | null },
): Promise<AgrementImportSummary> {
  await ensureAgrementsIndexes();
  const agences = (await listAgences()).filter((a) => a.actif && a.code.trim().length >= 2);
  const results: AgrementImportRowResult[] = [];
  let inserted = 0;
  let updated = 0;
  let unchanged = 0;
  let failed = 0;

  const forcedProduit = options?.produitCode?.trim().toUpperCase() || null;
  if (forcedProduit) {
    const invalidForced = await findInvalidProduitAutorisesCodes([forcedProduit]);
    if (invalidForced.length > 0) {
      return {
        inserted: 0,
        updated: 0,
        unchanged: 0,
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
    const rowNumber = index + 2;
    const raw = rows[index] ?? {};
    const mapped = mapAgrementImportRowFromRecord(raw);

    const referenceOfficielle = mapped.referenceOfficielle.trim();
    if (referenceOfficielle.length < 2) {
      failed += 1;
      results.push({ row: rowNumber, ok: false, error: "référence officielle requise" });
      continue;
    }

    const produitCode = (forcedProduit || mapped.produitCode).trim().toUpperCase();
    if (!produitCode) {
      failed += 1;
      results.push({
        row: rowNumber,
        ok: false,
        error: "produit requis (sélectionnez un produit ou renseignez la colonne)",
      });
      continue;
    }

    if (!forcedProduit) {
      const invalidProduits = await findInvalidProduitAutorisesCodes([produitCode]);
      if (invalidProduits.length > 0) {
        failed += 1;
        results.push({
          row: rowNumber,
          ok: false,
          error: `Produit invalide: ${produitCode}`,
        });
        continue;
      }
    }

    const dateReception =
      parseAgrementImportDate(mapped.dateReception) ?? new Date();

    let agenceId: string | null = null;
    if (mapped.agence.trim()) {
      const token = mapped.agence.trim();
      if (isObjectIdLike(token)) {
        const byId = agences.find((a) => a._id === token);
        if (!byId) {
          failed += 1;
          results.push({
            row: rowNumber,
            ok: false,
            error: `Agence introuvable: ${token}`,
          });
          continue;
        }
        agenceId = byId._id ?? null;
      } else {
        const resolved = matchAgenceFromImportToken(token, agences);
        if (!resolved?._id) {
          failed += 1;
          results.push({
            row: rowNumber,
            ok: false,
            error: `Agence introuvable ou inactive: ${token}`,
          });
          continue;
        }
        agenceId = resolved._id;
      }
    }

    if (agenceId && !canCreateConcessionnaireForAgence(actor, agenceId)) {
      failed += 1;
      results.push({
        row: rowNumber,
        ok: false,
        error: "Accès refusé pour cette agence",
      });
      continue;
    }

    let concessionnaireId: string | null = null;
    if (mapped.lonaciClientId?.trim()) {
      const cid = mapped.lonaciClientId.trim();
      if (!isObjectIdLike(cid)) {
        failed += 1;
        results.push({
          row: rowNumber,
          ok: false,
          error: "ID client Lonaci invalide",
        });
        continue;
      }
      concessionnaireId = cid;
    }

    try {
      const outcome = await upsertAgrementFromImport({
        produitCode,
        dateReception,
        referenceOfficielle,
        agenceId,
        concessionnaireId,
        observations: mapped.observations?.trim() || null,
        actorId: actor._id ?? "",
      });
      if (outcome.outcome === "inserted") inserted += 1;
      else if (outcome.outcome === "updated") updated += 1;
      else unchanged += 1;
      results.push({
        row: rowNumber,
        ok: true,
        reference: outcome.reference,
        agrementId: outcome.id,
      });
    } catch (error) {
      failed += 1;
      results.push({
        row: rowNumber,
        ok: false,
        error: error instanceof Error ? error.message : "Import impossible",
      });
    }
  }

  return { inserted, updated, unchanged, failed, results };
}
