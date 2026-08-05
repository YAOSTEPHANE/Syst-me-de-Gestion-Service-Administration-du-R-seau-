import "server-only";

import { canCreateConcessionnaireForAgence } from "@/lib/lonaci/access";
import { normalizeClientTypeDistributeur } from "@/lib/lonaci/client-constants";
import { matchAgenceFromImportToken } from "@/lib/lonaci/clients-import-map";
import { findProduitByCode, listAgences, listProduits } from "@/lib/lonaci/referentials";
import {
  SOUMISSION_STATUT_DEFAULT,
  type SoumissionStatut,
} from "@/lib/lonaci/soumission-constants";
import {
  mapSoumissionImportRowFromRecord,
  parseNombreTpe,
  parseSoumissionImportDate,
  resolveImportSoumissionStatut,
} from "@/lib/lonaci/soumissions-import-map";
import { ensureSoumissionsIndexes, upsertSoumissionFromImport } from "@/lib/lonaci/soumissions";
import type { UserDocument } from "@/lib/lonaci/types";

export type SoumissionImportRowInput = Record<string, unknown>;

export type SoumissionImportRowResult = {
  row: number;
  ok: boolean;
  soumissionId?: string;
  error?: string;
};

export type SoumissionImportSummary = {
  inserted: number;
  updated: number;
  unchanged: number;
  failed: number;
  results: SoumissionImportRowResult[];
};

function isObjectIdLike(value: string): boolean {
  return /^[a-f\d]{24}$/i.test(value.trim());
}

export async function importSoumissionsFromRows(
  rows: SoumissionImportRowInput[],
  actor: UserDocument,
  options?: { defaultAgenceId?: string; defaultProduitCode?: string },
): Promise<SoumissionImportSummary> {
  await ensureSoumissionsIndexes();
  const agences = (await listAgences()).filter((a) => a.actif && a.code.trim().length >= 2);
  const produits = (await listProduits()).filter((p) => p.actif && p.code.trim().length >= 1);
  const defaultAgenceId = options?.defaultAgenceId?.trim() || null;
  const defaultProduitCode = (options?.defaultProduitCode ?? "").trim().toUpperCase() || null;

  if (defaultAgenceId) {
    const exists = agences.some((a) => a._id === defaultAgenceId);
    if (!exists) {
      throw new Error("AGENCE_DEFAUT_INVALIDE");
    }
  }
  if (defaultProduitCode) {
    const produit = await findProduitByCode(defaultProduitCode);
    if (!produit?.actif) {
      throw new Error("PRODUIT_DEFAUT_INVALIDE");
    }
  }

  const results: SoumissionImportRowResult[] = [];
  let inserted = 0;
  let updated = 0;
  let unchanged = 0;
  let failed = 0;

  for (let index = 0; index < rows.length; index += 1) {
    const rowNumber = index + 2;
    const raw = rows[index] ?? {};
    const mapped = mapSoumissionImportRowFromRecord(raw);

    const nomComplet = mapped.nomComplet.trim();
    if (nomComplet.length < 2) {
      failed += 1;
      results.push({ row: rowNumber, ok: false, error: "nom complet requis" });
      continue;
    }

    const contact = mapped.contact.trim();
    if (contact.length < 4) {
      failed += 1;
      results.push({ row: rowNumber, ok: false, error: "contact requis (au moins 4 caractères)" });
      continue;
    }

    const typeDistributeur = normalizeClientTypeDistributeur(mapped.typeDistributeur) ?? "NOUVEAU";
    const nombreTpe = parseNombreTpe(mapped.nombreTpe) ?? 0;

    let agenceId: string | null = null;
    if (mapped.agence.trim()) {
      const token = mapped.agence.trim();
      if (isObjectIdLike(token)) {
        const byId = agences.find((a) => a._id === token);
        if (!byId) {
          failed += 1;
          results.push({ row: rowNumber, ok: false, error: `Agence introuvable: ${token}` });
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
    } else if (defaultAgenceId) {
      agenceId = defaultAgenceId;
    }

    if (!agenceId) {
      failed += 1;
      results.push({
        row: rowNumber,
        ok: false,
        error: "agence requise (colonne Agence ou filtre agence dans l’écran)",
      });
      continue;
    }

    if (!canCreateConcessionnaireForAgence(actor, agenceId)) {
      failed += 1;
      results.push({ row: rowNumber, ok: false, error: "Accès refusé pour cette agence" });
      continue;
    }

    const produitToken = (defaultProduitCode || mapped.produitCode || "").trim().toUpperCase();
    if (!produitToken) {
      failed += 1;
      results.push({
        row: rowNumber,
        ok: false,
        error: "produit requis (choisissez le produit avant d’importer)",
      });
      continue;
    }
    const produit =
      produits.find((p) => p.code.toUpperCase() === produitToken) ??
      (await findProduitByCode(produitToken));
    if (!produit?.actif) {
      failed += 1;
      results.push({ row: rowNumber, ok: false, error: `Produit introuvable ou inactif: ${produitToken}` });
      continue;
    }
    const produitCode = produit.code.toUpperCase();

    let statut: SoumissionStatut = SOUMISSION_STATUT_DEFAULT;
    if (mapped.statut.trim()) {
      const resolved = resolveImportSoumissionStatut(mapped.statut);
      if (!resolved) {
        failed += 1;
        results.push({ row: rowNumber, ok: false, error: `statut invalide: ${mapped.statut}` });
        continue;
      }
      statut = resolved;
    }

    const date = parseSoumissionImportDate(mapped.date) ?? new Date();
    const appele = mapped.appele ?? false;

    try {
      const outcome = await upsertSoumissionFromImport({
        nomComplet,
        contact,
        typeDistributeur,
        nombreTpe,
        agenceId,
        produitCode,
        statut,
        appele,
        date,
        observations: mapped.observations?.trim() || null,
        actorId: actor._id ?? "",
      });
      if (outcome.outcome === "inserted") inserted += 1;
      else if (outcome.outcome === "updated") updated += 1;
      else unchanged += 1;
      results.push({
        row: rowNumber,
        ok: true,
        soumissionId: outcome.item.id,
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
