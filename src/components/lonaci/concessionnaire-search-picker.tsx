"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";

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

const defaultInputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-cyan-500/20 placeholder:text-slate-400 focus:ring-2 focus:ring-cyan-500";

export type ConcessionnaireSearchPickerProps = {
  id?: string;
  label: ReactNode;
  selected: ConcessionnairePickerRow | null;
  onSelectedChange: (row: ConcessionnairePickerRow | null) => void;
  /** Filtre liste : concessionnaires ACTIF uniquement. */
  statutActifOnly?: boolean;
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
  listExtraParams,
  inputClassName,
  disabled = false,
  showClearLink = true,
  searchPlaceholder = "Code PDV, nom, téléphone… (min. 2 caractères)",
  minQueryLength = 2,
}: ConcessionnaireSearchPickerProps) {
  const inputClass = [defaultInputClass, inputClassName].filter(Boolean).join(" ");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ConcessionnairePickerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const minLen = Math.max(1, minQueryLength);

  useEffect(() => {
    if (selected) {
      setQuery(formatConcessionnairePickerLabel(selected));
    }
  }, [selected]);

  const onQueryChange = useCallback(
    (v: string) => {
      setQuery(v);
      if (selected && v.trim() !== formatConcessionnairePickerLabel(selected).trim()) {
        onSelectedChange(null);
      }
    },
    [onSelectedChange, selected],
  );

  useEffect(() => {
    if (selected) return;
    const q = query.trim();
    if (q.length < minLen) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(() => {
      void (async () => {
        setLoading(true);
        try {
          const params = new URLSearchParams({ page: "1", pageSize: "40", q });
          if (statutActifOnly) params.set("statut", "ACTIF");
          if (listExtraParams) {
            for (const [k, v] of Object.entries(listExtraParams)) {
              if (v.trim()) params.set(k, v.trim());
            }
          }
          const res = await fetch(`/api/concessionnaires?${params}`, {
            credentials: "include",
            cache: "no-store",
          });
          if (cancelled || !res.ok) {
            if (!cancelled) setResults([]);
            return;
          }
          const data = (await res.json()) as { items: Record<string, unknown>[] };
          const next = (data.items ?? []).map(normalizeItem).filter((x): x is ConcessionnairePickerRow => Boolean(x));
          if (!cancelled) setResults(next);
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, 320);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [query, selected, statutActifOnly, listExtraParams, minLen]);

  const selectedLabel = selected ? formatConcessionnairePickerLabel(selected) : "";
  const showPanel =
    query.trim().length >= minLen && (!selected || selectedLabel.trim() !== query.trim());

  function pick(row: ConcessionnairePickerRow) {
    onSelectedChange(row);
    setQuery(formatConcessionnairePickerLabel(row));
    setResults([]);
  }

  function clear() {
    onSelectedChange(null);
    setQuery("");
    setResults([]);
  }

  return (
    <div className="grid gap-1">
      <span className="text-xs font-medium text-slate-700">{label}</span>
      <div className="relative">
        <input
          id={id}
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={searchPlaceholder}
          autoComplete="off"
          disabled={disabled}
          className={inputClass}
          aria-label="Rechercher un point de vente"
        />
        {showClearLink && selected ? (
          <button
            type="button"
            onClick={() => clear()}
            className="mt-1 text-[11px] font-medium text-cyan-700 underline hover:text-cyan-900"
          >
            Effacer la sélection
          </button>
        ) : null}
      </div>
      {loading ? <p className="text-[11px] text-slate-500">Recherche…</p> : null}
      {showPanel && results.length > 0 ? (
        <div
          className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-sm"
          role="listbox"
          aria-label="Résultats de recherche concessionnaires"
        >
          {results.map((c) => (
            <button
              key={c.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(c)}
              className="flex w-full flex-wrap items-baseline gap-x-2 border-b border-slate-100 px-3 py-2 text-left text-sm text-slate-800 transition-colors hover:bg-cyan-50 last:border-b-0"
            >
              <span className="font-mono text-xs text-slate-600">{c.codePdv}</span>
              <span>{c.nomComplet || c.raisonSociale}</span>
            </button>
          ))}
        </div>
      ) : null}
      {showPanel && !loading && query.trim().length >= minLen && results.length === 0 ? (
        <p className="text-[11px] text-slate-500">Aucun résultat.</p>
      ) : null}
    </div>
  );
}
