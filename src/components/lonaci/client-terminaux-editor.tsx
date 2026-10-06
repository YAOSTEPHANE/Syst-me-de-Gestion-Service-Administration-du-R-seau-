"use client";

import {
  CLIENT_TERMINAUX_MAX,
  normalizeClientTerminalCode,
  normalizeClientTerminaux,
  type ClientTerminal,
} from "@/lib/lonaci/client-terminaux";

export type ClientTerminalFormRow = { key: string; codeMachine: string; numeroTpm: string };

let terminalRowSeq = 0;

function newTerminalRowKey(): string {
  terminalRowSeq += 1;
  return `tpe-${terminalRowSeq}`;
}

export function clientTerminauxToFormRows(terminaux: readonly ClientTerminal[] | null | undefined): ClientTerminalFormRow[] {
  return (terminaux ?? []).map((terminal) => ({
    key: newTerminalRowKey(),
    codeMachine: terminal.codeMachine,
    numeroTpm: terminal.numeroTpm ?? "",
  }));
}

export function clientTerminalFormRowsToPayload(rows: readonly ClientTerminalFormRow[]): ClientTerminal[] {
  return normalizeClientTerminaux(rows);
}

/** Codes saisis plusieurs fois dans le formulaire. */
export function duplicateClientTerminalCodes(rows: readonly ClientTerminalFormRow[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const row of rows) {
    const code = normalizeClientTerminalCode(row.codeMachine);
    if (!code) continue;
    if (seen.has(code)) duplicates.add(code);
    seen.add(code);
  }
  return [...duplicates];
}

export function ClientTerminauxEditor({
  rows,
  onChange,
  disabled = false,
}: {
  rows: ClientTerminalFormRow[];
  onChange: (rows: ClientTerminalFormRow[]) => void;
  disabled?: boolean;
}) {
  const count = clientTerminalFormRowsToPayload(rows).length;
  const duplicates = new Set(duplicateClientTerminalCodes(rows));
  const canAdd = !disabled && rows.length < CLIENT_TERMINAUX_MAX;

  function patchRow(key: string, patch: Partial<Omit<ClientTerminalFormRow, "key">>) {
    onChange(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  return (
    <fieldset className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <legend className="sr-only">Terminaux (TPE)</legend>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Terminaux (TPE)</p>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
          {count} TPE
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="mb-2 text-xs text-slate-500">Aucun TPE rattaché à ce client.</p>
      ) : (
        <ul className="mb-2 space-y-2">
          {rows.map((row, index) => {
            const code = normalizeClientTerminalCode(row.codeMachine);
            const isDuplicate = Boolean(code) && duplicates.has(code);
            return (
              <li key={row.key} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                <label className="block text-sm">
                  <span className="text-xs text-slate-600">Code machine {index + 1}</span>
                  <input
                    value={row.codeMachine}
                    onChange={(e) => patchRow(row.key, { codeMachine: e.target.value })}
                    placeholder="Ex. TERM-001"
                    maxLength={64}
                    disabled={disabled}
                    aria-invalid={isDuplicate || undefined}
                    className={`mt-1 w-full rounded border bg-white px-3 py-2 font-mono text-sm ${
                      isDuplicate ? "border-rose-400" : "border-slate-300"
                    }`}
                    autoComplete="off"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-xs text-slate-600">N° TPM</span>
                  <input
                    value={row.numeroTpm}
                    onChange={(e) => patchRow(row.key, { numeroTpm: e.target.value })}
                    maxLength={64}
                    disabled={disabled}
                    className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 font-mono text-sm"
                    autoComplete="off"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => onChange(rows.filter((r) => r.key !== row.key))}
                  disabled={disabled}
                  className="mb-0.5 rounded border border-slate-300 px-2 py-2 text-xs text-slate-600 hover:border-rose-300 hover:text-rose-700 disabled:opacity-50"
                  aria-label={`Retirer le TPE ${code || index + 1}`}
                >
                  Retirer
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {duplicates.size > 0 ? (
        <p className="mb-2 text-xs text-rose-700">
          Code machine en double : {[...duplicates].join(", ")}. Chaque TPE ne doit apparaître qu’une fois.
        </p>
      ) : null}
      <button
        type="button"
        onClick={() => onChange([...rows, { key: newTerminalRowKey(), codeMachine: "", numeroTpm: "" }])}
        disabled={!canAdd}
        className="rounded border border-dashed border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-slate-400 disabled:opacity-50"
      >
        + Ajouter un TPE
      </button>
      <p className="mt-2 text-[11px] text-slate-500">
        Un code machine ne peut être rattaché qu’à un seul client ; le nombre de TPE est calculé automatiquement.
      </p>
    </fieldset>
  );
}
