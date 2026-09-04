"use client";

import { useMemo, useState } from "react";

type DocumentAFournirItem = {
  id: string;
  libelle: string;
  obligatoire?: boolean;
};

type Props = {
  items: readonly DocumentAFournirItem[];
  title?: string;
  hint?: string;
  className?: string;
  /** Si false, cases désactivées. Défaut : cochable. */
  interactive?: boolean;
  /** Mode contrôlé : ids des pièces cochées « fournies ». */
  value?: ReadonlySet<string>;
  onChange?: (fourniIds: Set<string>) => void;
};

/**
 * Liste à cocher des pièces attendues — à placer dans les formulaires (création / fiche).
 */
export default function DocumentsAFournirChecklist({
  items,
  title = "Documents à fournir",
  hint = "Cochez les pièces déjà remises par le client.",
  className = "",
  interactive = true,
  value,
  onChange,
}: Props) {
  const itemIdsKey = useMemo(() => items.map((i) => i.id).join("|"), [items]);
  const [internalFourniIds, setInternalFourniIds] = useState<Set<string>>(() => new Set());
  const [syncedKey, setSyncedKey] = useState(itemIdsKey);
  const isControlled = value !== undefined;
  const fourniIds = isControlled ? value : internalFourniIds;

  if (!isControlled && syncedKey !== itemIdsKey) {
    setSyncedKey(itemIdsKey);
    const valid = new Set(items.map((i) => i.id));
    setInternalFourniIds((prev) => {
      const next = new Set<string>();
      for (const id of prev) {
        if (valid.has(id)) next.add(id);
      }
      return next;
    });
  }

  const updateFourniIds = (updater: (prev: Set<string>) => Set<string>) => {
    if (isControlled && onChange) {
      onChange(updater(new Set(value)));
      return;
    }
    setInternalFourniIds(updater);
  };

  const obligatoires = items.filter((i) => i.obligatoire !== false);
  const fournis = obligatoires.filter((i) => fourniIds.has(i.id)).length;

  if (!items.length) return null;

  return (
    <div className={className}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-800">{title}</p>
        <span className="text-[10px] font-medium text-slate-600">
          {fournis}/{obligatoires.length || items.length} coché
          {(obligatoires.length || items.length) !== 1 ? "s" : ""}
        </span>
      </div>
      {hint ? <p className="mb-2 text-[11px] text-slate-600">{hint}</p> : null}
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {items.map((item) => {
          const inputId = `doc-fournir-${item.id}`;
          const checked = fourniIds.has(item.id);
          return (
            <li key={item.id}>
              <label
                htmlFor={inputId}
                className={`flex items-start gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-800 ${
                  interactive ? "cursor-pointer hover:border-cyan-300 hover:bg-cyan-50/40" : "cursor-default opacity-90"
                }`}
              >
                <input
                  id={inputId}
                  type="checkbox"
                  checked={checked}
                  disabled={!interactive}
                  onChange={(e) => {
                    if (!interactive) return;
                    updateFourniIds((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(item.id);
                      else next.delete(item.id);
                      return next;
                    });
                  }}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                />
                <span>
                  {item.libelle}
                  {item.obligatoire !== false ? (
                    <span className="ml-1 text-[10px] font-semibold text-rose-700">*</span>
                  ) : (
                    <span className="ml-1 text-[10px] text-slate-500">(facultatif)</span>
                  )}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      {items.some((i) => i.obligatoire !== false) ? (
        <p className="mt-2 text-[10px] text-slate-500">
          <span className="font-semibold text-rose-700">*</span> Pièce obligatoire
        </p>
      ) : null}
    </div>
  );
}
