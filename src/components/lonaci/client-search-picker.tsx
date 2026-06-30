"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";

import { produitAutorisePourConcessionnaire } from "@/lib/lonaci/contrat-produit-rules";

/** Ligne renvoyée par GET /api/clients (champs utiles au métier). */
export type ClientPickerRow = {
  id: string;
  code: string;
  nomComplet?: string | null;
  raisonSociale?: string | null;
  agenceId?: string | null;
  produitsAutorises?: string[];
  cniNumero?: string | null;
  telephone?: string | null;
};

export function formatClientPickerLabel(c: ClientPickerRow): string {
  const name = (c.nomComplet || c.raisonSociale || "").trim();
  const code = (c.code || "").trim();
  if (code && name) return `${code} — ${name}`;
  return name || code || c.id;
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
    nomComplet: (raw.nomComplet as string | null | undefined) ?? null,
    raisonSociale: (raw.raisonSociale as string | null | undefined) ?? null,
    agenceId: (raw.agenceId as string | null | undefined) ?? null,
    produitsAutorises: Array.isArray(raw.produitsAutorises) ? (raw.produitsAutorises as string[]) : undefined,
    cniNumero: (raw.cniNumero as string | null | undefined) ?? null,
    telephone: (raw.telephone as string | null | undefined) ?? null,
  };
}

const defaultInputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-cyan-500/20 placeholder:text-slate-400 focus:ring-2 focus:ring-cyan-500";

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
  const inputClass = [defaultInputClass, inputClassName].filter(Boolean).join(" ");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ClientPickerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const minLen = Math.max(1, minQueryLength);

  useEffect(() => {
    if (selected) {
      setQuery(formatClientPickerLabel(selected));
    }
  }, [selected]);

  const onQueryChange = useCallback(
    (v: string) => {
      setQuery(v);
      if (selected && v.trim() !== formatClientPickerLabel(selected).trim()) {
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
          const params = new URLSearchParams({
            page: "1",
            pageSize: "40",
            q,
          });
          if (filter === "promotion") {
            params.set("eligibleForPromotion", "true");
          } else if (filter === "linkedPdv") {
            params.set("linkedToConcessionnaire", "true");
          } else {
            params.set("eligibleForContrat", "true");
          }
          const res = await fetch(`/api/clients?${params}`, {
            credentials: "include",
            cache: "no-store",
          });
          if (cancelled || !res.ok) {
            if (!cancelled) setResults([]);
            return;
          }
          const data = (await res.json()) as { items: Record<string, unknown>[] };
          const next = (data.items ?? []).map(normalizeItem).filter((x): x is ClientPickerRow => Boolean(x));
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
  }, [query, selected, minLen, filter]);

  const selectedLabel = selected ? formatClientPickerLabel(selected) : "";
  const showPanel =
    query.trim().length >= minLen && (!selected || selectedLabel.trim() !== query.trim());

  function pick(row: ClientPickerRow) {
    onSelectedChange(row);
    setQuery(formatClientPickerLabel(row));
    setResults([]);
  }

  return (
    <label className="grid gap-1" htmlFor={id}>
      <span className="text-xs font-medium text-slate-700">{label}</span>
      <input
        id={id}
        type="search"
        autoComplete="off"
        disabled={disabled}
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder={searchPlaceholder}
        className={inputClass}
      />
      {showClearLink && selected ? (
        <button
          type="button"
          className="w-fit text-xs text-cyan-700 underline-offset-2 hover:underline"
          onClick={() => {
            onSelectedChange(null);
            setQuery("");
            setResults([]);
          }}
        >
          Effacer la sélection
        </button>
      ) : null}
      {loading ? <p className="text-xs text-slate-500">Recherche…</p> : null}
      {showPanel && !loading && results.length === 0 ? (
        <p className="text-xs text-slate-500">Aucun client trouvé.</p>
      ) : null}
      {showPanel && results.length > 0 ? (
        <ul className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          {results.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm text-slate-800 hover:bg-cyan-50"
                onClick={() => pick(row)}
              >
                {formatClientPickerLabel(row)}
                {(row.produitsAutorises ?? []).length > 0 ? (
                  <span className="mt-0.5 block text-[11px] text-slate-500">
                    Produits : {(row.produitsAutorises ?? []).join(", ")}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </label>
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
