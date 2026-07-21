"use client";

import type { ReactNode } from "react";
import { useCallback } from "react";

import { EntityPicker } from "@/components/lonaci/ui/entity-picker";
import { clientDisplayName, normalizeClientCategorie } from "@/lib/lonaci/client-constants";
import { produitAutorisePourConcessionnaire } from "@/lib/lonaci/contrat-produit-rules";

/** Ligne renvoyée par GET /api/clients (champs utiles au métier). */
export type ClientPickerRow = {
  id: string;
  code: string;
  categorie?: string | null;
  nomComplet?: string | null;
  raisonSociale?: string | null;
  agenceId?: string | null;
  produitsAutorises?: string[];
  cniNumero?: string | null;
  telephone?: string | null;
};

export function formatClientPickerLabel(c: ClientPickerRow): string {
  const name = clientDisplayName({
    categorie: c.categorie,
    nomComplet: c.nomComplet,
    raisonSociale: c.raisonSociale ?? "",
  });
  const code = (c.code || "").trim();
  const categorie = normalizeClientCategorie(c.categorie);
  const typeTag = categorie === "ENTREPRISE" ? " [Entreprise]" : "";
  if (code && name) return `${code} — ${name}${typeTag}`;
  return `${name || code || c.id}${typeTag}`;
}

export function pickProduitCodeFromClient(
  row: ClientPickerRow | null,
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

export function pickAgenceIdFromClient(
  row: ClientPickerRow | null,
  availableAgenceIds: readonly string[],
): string {
  if (!row?.agenceId?.trim() || !availableAgenceIds.length) return "";
  const target = row.agenceId.trim();
  const byNorm = new Map(availableAgenceIds.map((id) => [id.trim(), id]));
  return byNorm.get(target) ?? "";
}

function normalizeItem(raw: Record<string, unknown>): ClientPickerRow | null {
  const id = String(raw.id ?? "").trim();
  if (!id) return null;
  return {
    id,
    code: String(raw.code ?? ""),
    categorie: (raw.categorie as string | null | undefined) ?? null,
    nomComplet: (raw.nomComplet as string | null | undefined) ?? null,
    raisonSociale: (raw.raisonSociale as string | null | undefined) ?? null,
    agenceId: (raw.agenceId as string | null | undefined) ?? null,
    produitsAutorises: Array.isArray(raw.produitsAutorises) ? (raw.produitsAutorises as string[]) : undefined,
    cniNumero: (raw.cniNumero as string | null | undefined) ?? null,
    telephone: (raw.telephone as string | null | undefined) ?? null,
  };
}

export type ClientSearchPickerProps = {
  id?: string;
  label: ReactNode;
  selected: ClientPickerRow | null;
  onSelectedChange: (row: ClientPickerRow | null) => void;
  inputClassName?: string;
  disabled?: boolean;
  showClearLink?: boolean;
  searchPlaceholder?: string;
  minQueryLength?: number;
  /** Filtre API : contrat (défaut), promotion PDV, ou client déjà lié à un PDV. */
  filter?: "contrat" | "promotion" | "linkedPdv";
};

export default function ClientSearchPicker({
  id,
  label,
  selected,
  onSelectedChange,
  inputClassName,
  disabled = false,
  showClearLink = true,
  searchPlaceholder = "Nom, code client, CNI, téléphone… (min. 2 caractères)",
  minQueryLength = 2,
  filter = "contrat",
}: ClientSearchPickerProps) {
  const loadOptions = useCallback(
    async (query: string): Promise<readonly ClientPickerRow[]> => {
      const params = new URLSearchParams({
        page: "1",
        pageSize: "40",
        q: query,
      });
      if (filter === "promotion") {
        params.set("eligibleForPromotion", "true");
      } else if (filter === "linkedPdv") {
        params.set("linkedToConcessionnaire", "true");
      } else {
        params.set("eligibleForContrat", "true");
      }
      const response = await fetch(`/api/clients?${params}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) return [];
      const data = (await response.json()) as { items?: Record<string, unknown>[] };
      return (data.items ?? []).map(normalizeItem).filter((row): row is ClientPickerRow => row !== null);
    },
    [filter],
  );

  return (
    <EntityPicker
      id={id}
      label={label}
      selected={selected}
      onSelectedChange={onSelectedChange}
      loadOptions={loadOptions}
      getOptionKey={(row) => row.id}
      getOptionLabel={formatClientPickerLabel}
      renderOption={(row) => (
        <>
          {formatClientPickerLabel(row)}
          {(row.produitsAutorises ?? []).length > 0 ? (
            <span className="mt-0.5 block text-[11px] text-slate-500">
              Produits : {(row.produitsAutorises ?? []).join(", ")}
            </span>
          ) : null}
        </>
      )}
      inputClassName={inputClassName}
      disabled={disabled}
      showClearLink={showClearLink}
      searchPlaceholder={searchPlaceholder}
      minQueryLength={minQueryLength}
      emptyMessage="Aucun client trouvé."
      resultsAriaLabel="Résultats de recherche clients"
    />
  );
}

/** Filtre les codes produits autorisés sur la fiche client. */
export function filterProduitCodesForClient(
  row: ClientPickerRow | null,
  availableProduitCodes: readonly string[],
): string[] {
  if (!row) return [...availableProduitCodes];
  const all = availableProduitCodes.filter((code) =>
    produitAutorisePourConcessionnaire(row.produitsAutorises ?? [], code),
  );
  return all.length > 0 ? all : [];
}
