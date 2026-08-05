"use client";

import {
  CLIENT_CATEGORIES,
  CLIENT_CATEGORIE_LABELS,
  type ClientCategorie,
} from "@/lib/lonaci/client-constants";
import { Button } from "@/components/lonaci/ui/button";
import { FormField } from "@/components/lonaci/ui/form-field";
import { Surface } from "@/components/lonaci/ui/surface";

export type ProduitPieceDraft = {
  id: string;
  libelle: string;
  obligatoire: boolean;
  /** Vide = toutes les catégories. */
  categories: ClientCategorie[];
};

export function piecesFromStored(
  items:
    | Array<{
        id: string;
        libelle: string;
        obligatoire?: boolean;
        categories?: string[];
      }>
    | undefined,
): ProduitPieceDraft[] {
  return (items ?? []).map((item) => {
    const categories = (item.categories ?? [])
      .map((c) => c.trim().toUpperCase())
      .filter((c): c is ClientCategorie =>
        (CLIENT_CATEGORIES as readonly string[]).includes(c),
      );
    return {
      id: item.id,
      libelle: item.libelle,
      obligatoire: item.obligatoire !== false,
      categories,
    };
  });
}

export function piecesToApiPayload(items: ProduitPieceDraft[]): Array<{
  id: string;
  libelle: string;
  obligatoire: boolean;
  categories?: ClientCategorie[];
}> {
  return items
    .map((item) => {
      const categories =
        item.categories.length > 0 && item.categories.length < CLIENT_CATEGORIES.length
          ? [...item.categories]
          : undefined;
      return {
        id: item.id.trim() || `doc_${item.libelle.slice(0, 8)}`,
        libelle: item.libelle.trim(),
        obligatoire: item.obligatoire,
        ...(categories ? { categories } : {}),
      };
    })
    .filter((item) => item.libelle.length >= 2);
}

function newPieceId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `doc_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `doc_${Date.now()}`;
}

export function createEmptyPiece(): ProduitPieceDraft {
  return { id: newPieceId(), libelle: "", obligatoire: true, categories: [] };
}

function toggleCategory(current: ClientCategorie[], category: ClientCategorie): ClientCategorie[] {
  if (current.includes(category)) {
    return current.filter((c) => c !== category);
  }
  return [...CLIENT_CATEGORIES].filter((c) => c === category || current.includes(c));
}

type ProduitPiecesEditorProps = {
  items: ProduitPieceDraft[];
  onChange: (items: ProduitPieceDraft[]) => void;
  disabled?: boolean;
  compact?: boolean;
  helpText?: string;
};

export default function ProduitPiecesEditor({
  items,
  onChange,
  disabled = false,
  compact = false,
  helpText = "Ces pièces alimentent automatiquement les checklists. Choisissez les types de clients concernés (tous si aucune case cochée).",
}: ProduitPiecesEditorProps) {
  function updateAt(index: number, patch: Partial<ProduitPieceDraft>) {
    onChange(items.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function removeAt(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  function moveUp(index: number) {
    if (index <= 0) return;
    const next = [...items];
    [next[index - 1], next[index]] = [next[index], next[index - 1]!];
    onChange(next);
  }

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      <p className="text-[11px] text-slate-600">{helpText}</p>
      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-center text-xs text-slate-500">
          Aucune pièce configurée pour ce produit.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((item, index) => {
            const inputId = `produit-piece-${item.id}`;
            return (
              <li key={item.id}>
                <Surface
                  padding="none"
                  className="flex flex-col gap-2 bg-slate-50/80 px-2 py-2"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="w-6 shrink-0 text-center text-[10px] font-semibold text-slate-400">
                      {index + 1}
                    </span>
                    <FormField
                      label={<span className="lonaci-ui-sr-only">Libellé pièce {index + 1}</span>}
                      htmlFor={inputId}
                      className="min-w-[12rem] flex-1"
                    >
                      <input
                        id={inputId}
                        type="text"
                        value={item.libelle}
                        disabled={disabled}
                        onChange={(event) => updateAt(index, { libelle: event.target.value })}
                        placeholder="Ex. Pièce d'identité"
                        maxLength={200}
                        className="text-xs disabled:bg-slate-100"
                      />
                    </FormField>
                    <label className="flex shrink-0 items-center gap-1.5 text-[11px] text-slate-700">
                      <input
                        type="checkbox"
                        checked={item.obligatoire}
                        disabled={disabled}
                        onChange={(event) => updateAt(index, { obligatoire: event.target.checked })}
                        className="h-3.5 w-3.5 rounded border-slate-300 text-cyan-600"
                      />
                      Obligatoire
                    </label>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={disabled || index === 0}
                        onClick={() => moveUp(index)}
                        className="min-h-0 px-2 py-1 text-xs"
                        title="Monter"
                      >
                        ↑
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        disabled={disabled}
                        onClick={() => removeAt(index)}
                        className="min-h-0 px-2 py-1 text-xs"
                        title="Supprimer"
                      >
                        Retirer
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-8">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      Types de clients
                    </span>
                    {CLIENT_CATEGORIES.map((cat) => {
                      const allSelected = item.categories.length === 0;
                      const checked = allSelected || item.categories.includes(cat);
                      return (
                        <label
                          key={cat}
                          className="flex items-center gap-1 text-[11px] text-slate-700"
                          title={
                            allSelected
                              ? "Toutes les catégories (aucune restriction)"
                              : CLIENT_CATEGORIE_LABELS[cat]
                          }
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={disabled}
                            onChange={() => {
                              if (allSelected) {
                                // « Toutes » → retirer uniquement cette catégorie
                                updateAt(index, {
                                  categories: CLIENT_CATEGORIES.filter((c) => c !== cat),
                                });
                                return;
                              }
                              const next = toggleCategory(item.categories, cat);
                              updateAt(index, {
                                categories:
                                  next.length === 0 || next.length === CLIENT_CATEGORIES.length
                                    ? []
                                    : next,
                              });
                            }}
                            className="h-3.5 w-3.5 rounded border-slate-300 text-cyan-600"
                          />
                          {CLIENT_CATEGORIE_LABELS[cat]}
                        </label>
                      );
                    })}
                    {item.categories.length === 0 ? (
                      <span className="text-[10px] text-slate-500">(tous)</span>
                    ) : null}
                  </div>
                </Surface>
              </li>
            );
          })}
        </ul>
      )}
      <Button
        variant="secondary"
        size="sm"
        disabled={disabled}
        onClick={() => onChange([...items, createEmptyPiece()])}
        className="text-xs"
      >
        + Ajouter une pièce
      </Button>
    </div>
  );
}
