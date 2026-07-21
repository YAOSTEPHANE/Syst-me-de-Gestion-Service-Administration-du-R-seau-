"use client";

import type { ReactNode } from "react";
import { useCallback } from "react";

import { EntityPicker } from "@/components/lonaci/ui/entity-picker";

/** Ligne renvoyée par GET /api/concessionnaires (champs utiles au métier). */
export type ConcessionnairePickerRow = {
  id: string;
  codePdv: string;
  nomComplet?: string | null;
  raisonSociale?: string | null;
  agenceId?: string | null;
  produitsAutorises?: string[];
};

export function formatConcessionnairePickerLabel(c: ConcessionnairePickerRow): string {
  const name = (c.nomComplet || c.raisonSociale || "").trim();
  const code = (c.codePdv || "").trim();
  if (code && name) return `${code} — ${name}`;
  return name || code || c.id;
}

/**
 * Premier code produit de la fiche PDV (`produitsAutorises`, ordre conservé) présent dans `availableProduitCodes`.
 */
export function pickProduitCodeFromConcessionnaire(
  row: ConcessionnairePickerRow | null,
  availableProduitCodes: readonly string[],
): string {
  if (!row || !availableProduitCodes.length) return "";
  const order = (row.produitsAutorises ?? [])
    .map((c) => String(c).trim())
    .filter(Boolean);
  if (!order.length) return "";
  const byUpper = new Map(availableProduitCodes.map((c) => [c.trim().toUpperCase(), c]));
  for (const raw of order) {
    const hit = byUpper.get(raw.toUpperCase());
    if (hit !== undefined) return hit;
  }
  return "";
}

/**
 * Tous les codes produits autorisés sur la fiche PDV qui existent dans le référentiel, dans l’ordre de la fiche.
 */
/**
 * `agenceId` du PDV si cet id figure dans la liste des agences du formulaire (référentiel).
 */
export function pickAgenceIdFromConcessionnaire(
  row: ConcessionnairePickerRow | null,
  availableAgenceIds: readonly string[],
): string {
  if (!row?.agenceId?.trim() || !availableAgenceIds.length) return "";
  const target = row.agenceId.trim();
  const byNorm = new Map(availableAgenceIds.map((id) => [id.trim(), id]));
  return byNorm.get(target) ?? "";
}

export function pickProduitCodesFromConcessionnaire(
  row: ConcessionnairePickerRow | null,
  availableProduitCodes: readonly string[],
): string[] {
  if (!row || !availableProduitCodes.length) return [];
  const order = (row.produitsAutorises ?? [])
    .map((c) => String(c).trim())
    .filter(Boolean);
  if (!order.length) return [];
  const byUpper = new Map(availableProduitCodes.map((c) => [c.trim().toUpperCase(), c]));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of order) {
    const hit = byUpper.get(raw.toUpperCase());
    if (hit !== undefined && !seen.has(hit)) {
      seen.add(hit);
      out.push(hit);
    }
  }
  return out;
}

function normalizeItem(raw: Record<string, unknown>): ConcessionnairePickerRow | null {
  const id = String(raw.id ?? "").trim();
  if (!id) return null;
  return {
    id,
    codePdv: String(raw.codePdv ?? ""),
    nomComplet: (raw.nomComplet as string | null | undefined) ?? null,
    raisonSociale: (raw.raisonSociale as string | null | undefined) ?? null,
    agenceId: (raw.agenceId as string | null | undefined) ?? null,
    produitsAutorises: Array.isArray(raw.produitsAutorises) ? (raw.produitsAutorises as string[]) : undefined,
  };
}

export type ConcessionnaireSearchPickerProps = {
  id?: string;
  label: ReactNode;
  selected: ConcessionnairePickerRow | null;
  onSelectedChange: (row: ConcessionnairePickerRow | null) => void;
  /** Filtre liste : concessionnaires ACTIF uniquement. */
  statutActifOnly?: boolean;
  /** Uniquement inscriptions finalisées (code PDV attribué). */
  inscriptionFinaliseeOnly?: boolean;
  /** Paramètres additionnels pour la liste (ex. `agenceId`, `produitCode`). */
  listExtraParams?: Record<string, string>;
  inputClassName?: string;
  disabled?: boolean;
  /** Affiche un lien pour vider la sélection (formulaires). */
  showClearLink?: boolean;
  searchPlaceholder?: string;
  minQueryLength?: number;
};

export default function ConcessionnaireSearchPicker({
  id,
  label,
  selected,
  onSelectedChange,
  statutActifOnly = false,
  inscriptionFinaliseeOnly = false,
  listExtraParams,
  inputClassName,
  disabled = false,
  showClearLink = true,
  searchPlaceholder = "Code PDV, nom, téléphone… (min. 2 caractères)",
  minQueryLength = 2,
}: ConcessionnaireSearchPickerProps) {
  const loadOptions = useCallback(
    async (query: string): Promise<readonly ConcessionnairePickerRow[]> => {
      const params = new URLSearchParams({ page: "1", pageSize: "40", q: query });
      if (statutActifOnly) params.set("statut", "ACTIF");
      if (inscriptionFinaliseeOnly) params.set("inscriptionFinaliseeOnly", "true");
      if (listExtraParams) {
        for (const [key, value] of Object.entries(listExtraParams)) {
          if (value.trim()) params.set(key, value.trim());
        }
      }
      const response = await fetch(`/api/concessionnaires?${params}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) return [];
      const data = (await response.json()) as { items?: Record<string, unknown>[] };
      return (data.items ?? [])
        .map(normalizeItem)
        .filter((row): row is ConcessionnairePickerRow => row !== null);
    },
    [inscriptionFinaliseeOnly, listExtraParams, statutActifOnly],
  );

  return (
    <EntityPicker
      id={id}
      label={label}
      selected={selected}
      onSelectedChange={onSelectedChange}
      loadOptions={loadOptions}
      getOptionKey={(row) => row.id}
      getOptionLabel={formatConcessionnairePickerLabel}
      renderOption={(row) => (
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-mono text-xs text-slate-600">{row.codePdv}</span>
          <span>{row.nomComplet || row.raisonSociale}</span>
        </span>
      )}
      inputClassName={inputClassName}
      disabled={disabled}
      showClearLink={showClearLink}
      searchPlaceholder={searchPlaceholder}
      minQueryLength={minQueryLength}
      resultsAriaLabel="Résultats de recherche concessionnaires"
    />
  );
}
