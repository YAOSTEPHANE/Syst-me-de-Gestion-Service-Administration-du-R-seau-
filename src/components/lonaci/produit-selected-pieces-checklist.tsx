"use client";

import { useMemo, useState } from "react";

import { Surface } from "@/components/lonaci/ui/surface";
import { mergeProductChecklistTemplates } from "@/lib/lonaci/produit-document-checklist";
import type { ProduitDocument, ProduitDocumentChecklistItem } from "@/lib/lonaci/types";

export type ReferentialProduitPieces = {
  code: string;
  libelle?: string;
  actif?: boolean;
  documentsChecklist?: ProduitDocumentChecklistItem[];
};

function toProduitDocuments(rows: ReferentialProduitPieces[]): ProduitDocument[] {
  return rows.map((p) => ({
    code: p.code,
    libelle: p.libelle ?? p.code,
    actif: p.actif !== false,
    documentsChecklist: p.documentsChecklist,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  }));
}

type Props = {
  selectedProduitCodes: string[];
  produits: ReferentialProduitPieces[];
  title?: string;
  hint?: string;
  className?: string;
  /** Mode contrôlé : ids des pièces cochées « fournies » (persistées par le parent). */
  value?: ReadonlySet<string>;
  onChange?: (fourniIds: Set<string>) => void;
};

export default function ProduitSelectedPiecesChecklist({
  selectedProduitCodes,
  produits,
  title = "Pièces à fournir",
  hint = "Cochez les pièces remises par le client (selon le référentiel produit).",
  className = "",
  value,
  onChange,
}: Props) {
  const items = useMemo(() => {
    if (!selectedProduitCodes.length) return [];
    return mergeProductChecklistTemplates(selectedProduitCodes, toProduitDocuments(produits));
  }, [selectedProduitCodes, produits]);

  const itemIdsKey = useMemo(() => items.map((i) => i.id).sort().join("|"), [items]);

  const [internalFourniIds, setInternalFourniIds] = useState<Set<string>>(new Set());
  const [prunedForKey, setPrunedForKey] = useState(itemIdsKey);
  const isControlled = value !== undefined;
  const fourniIds = isControlled ? value : internalFourniIds;

  if (!isControlled && prunedForKey !== itemIdsKey) {
    setPrunedForKey(itemIdsKey);
    const validIds = new Set(items.map((i) => i.id));
    setInternalFourniIds((prev) => {
      const next = new Set<string>();
      for (const id of prev) {
        if (validIds.has(id)) next.add(id);
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

  if (!selectedProduitCodes.length) return null;

  const obligatoires = items.filter((i) => i.obligatoire !== false);
  const fournis = obligatoires.filter((i) => fourniIds.has(i.id)).length;

  return (
    <Surface
      padding="none"
      className={`border-cyan-200/80 bg-cyan-50/30 px-3 py-2 ${className}`}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-cyan-950">{title}</p>
        {items.length > 0 ? (
          <span className="text-[10px] font-medium text-slate-600">
            {fournis}/{obligatoires.length} obligatoire{obligatoires.length !== 1 ? "s" : ""} coché
            {obligatoires.length !== 1 ? "s" : ""}
          </span>
        ) : null}
      </div>
      {hint ? <p className="mb-2 text-[11px] text-slate-600">{hint}</p> : null}
      {items.length === 0 ? (
        <p className="text-[11px] text-amber-800">
          Aucune pièce configurée pour ce(s) produit(s). Complétez le référentiel{" "}
          <span className="font-medium">Paramètres → Produits</span>.
        </p>
      ) : (
        <ul className="max-h-48 space-y-1.5 overflow-y-auto">
          {items.map((item) => (
            <li key={item.id}>
              <label className="flex cursor-pointer items-start gap-2 rounded-md px-1 py-0.5 text-xs text-slate-800 hover:bg-white/70">
                <input
                  type="checkbox"
                  checked={fourniIds.has(item.id)}
                  onChange={(e) =>
                    updateFourniIds((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(item.id);
                      else next.delete(item.id);
                      return next;
                    })
                  }
                  className="mt-0.5 rounded border-slate-300 text-cyan-600"
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
          ))}
        </ul>
      )}
    </Surface>
  );
}
