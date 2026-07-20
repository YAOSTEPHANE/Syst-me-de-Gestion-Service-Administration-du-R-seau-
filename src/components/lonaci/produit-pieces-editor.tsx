"use client";

export type ProduitPieceDraft = {
  id: string;
  libelle: string;
  obligatoire: boolean;
};

export function piecesFromStored(
  items: Array<{ id: string; libelle: string; obligatoire?: boolean }> | undefined,
): ProduitPieceDraft[] {
  return (items ?? []).map((item) => ({
    id: item.id,
    libelle: item.libelle,
    obligatoire: item.obligatoire !== false,
  }));
}

export function piecesToApiPayload(items: ProduitPieceDraft[]): Array<{
  id: string;
  libelle: string;
  obligatoire: boolean;
}> {
  return items
    .map((item) => ({
      id: item.id.trim() || `doc_${item.libelle.slice(0, 8)}`,
      libelle: item.libelle.trim(),
      obligatoire: item.obligatoire,
    }))
    .filter((item) => item.libelle.length >= 2);
}

function newPieceId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `doc_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `doc_${Date.now()}`;
}

export function createEmptyPiece(): ProduitPieceDraft {
  return { id: newPieceId(), libelle: "", obligatoire: true };
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
  helpText = "Ces pièces alimentent automatiquement les checklists (inscription concessionnaire, dossiers, cessions, résiliations…).",
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
          {items.map((item, index) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/80 px-2 py-2"
            >
              <span className="w-6 shrink-0 text-center text-[10px] font-semibold text-slate-400">
                {index + 1}
              </span>
              <input
                type="text"
                value={item.libelle}
                disabled={disabled}
                onChange={(e) => updateAt(index, { libelle: e.target.value })}
                placeholder="Ex. Pièce d'identité"
                maxLength={200}
                className="min-w-[12rem] flex-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-cyan-500/30 disabled:bg-slate-100"
                aria-label={`Libellé pièce ${index + 1}`}
              />
              <label className="flex shrink-0 items-center gap-1.5 text-[11px] text-slate-700">
                <input
                  type="checkbox"
                  checked={item.obligatoire}
                  disabled={disabled}
                  onChange={(e) => updateAt(index, { obligatoire: e.target.checked })}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-cyan-600"
                />
                Obligatoire
              </label>
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  disabled={disabled || index === 0}
                  onClick={() => moveUp(index)}
                  className="rounded border border-slate-300 bg-white px-1.5 py-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                  title="Monter"
                >
                  ↑
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => removeAt(index)}
                  className="rounded border border-rose-200 bg-rose-50 px-1.5 py-1 text-[10px] font-semibold text-rose-800 hover:bg-rose-100 disabled:opacity-40"
                  title="Supprimer"
                >
                  Retirer
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange([...items, createEmptyPiece()])}
        className="rounded-lg border border-cyan-300 bg-cyan-50 px-3 py-1.5 text-xs font-semibold text-cyan-900 hover:bg-cyan-100 disabled:opacity-50"
      >
        + Ajouter une pièce
      </button>
    </div>
  );
}
