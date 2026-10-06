import { z } from "zod";

/** TPE (terminaux) rattachés à une fiche client. */
export interface ClientTerminal {
  codeMachine: string;
  numeroTpm: string | null;
}

export const CLIENT_TERMINAUX_MAX = 50;

export const clientTerminauxInputSchema = z
  .array(
    z.object({
      codeMachine: z.string().trim().min(1, "Code machine requis").max(64),
      numeroTpm: z.preprocess(
        (v) => (typeof v === "string" && v.trim() === "" ? null : v),
        z.union([z.string().trim().max(64), z.null()]).optional(),
      ),
    }),
  )
  .max(CLIENT_TERMINAUX_MAX, `${CLIENT_TERMINAUX_MAX} TPE maximum par client`);

const LEGACY_LIST_SEPARATOR = /[,;/\n]+/;

export function normalizeClientTerminalCode(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function normalizeNumeroTpm(raw: unknown): string | null {
  const value = String(raw ?? "").trim();
  return value || null;
}

/** Supprime les codes vides et les doublons (le premier N° TPM renseigné l'emporte). */
export function normalizeClientTerminaux(
  rows: ReadonlyArray<{ codeMachine?: unknown; numeroTpm?: unknown }> | null | undefined,
): ClientTerminal[] {
  const byCode = new Map<string, ClientTerminal>();
  for (const row of rows ?? []) {
    const codeMachine = normalizeClientTerminalCode(row.codeMachine);
    if (!codeMachine) continue;
    const numeroTpm = normalizeNumeroTpm(row.numeroTpm);
    const existing = byCode.get(codeMachine);
    if (existing) {
      if (!existing.numeroTpm && numeroTpm) existing.numeroTpm = numeroTpm;
      continue;
    }
    byCode.set(codeMachine, { codeMachine, numeroTpm });
  }
  return [...byCode.values()];
}

function splitLegacyList(raw: string | null | undefined): string[] {
  return String(raw ?? "")
    .split(LEGACY_LIST_SEPARATOR)
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Liste effective des TPE d'une fiche : `terminaux` si renseigné, sinon reconstruite
 * depuis les anciens champs `codeMachine` / `numeroTpm` (éventuellement séparés par , ; /).
 */
export function resolveClientTerminaux(doc: {
  terminaux?: ReadonlyArray<{ codeMachine?: unknown; numeroTpm?: unknown }> | null;
  codeMachine?: string | null;
  numeroTpm?: string | null;
}): ClientTerminal[] {
  const current = normalizeClientTerminaux(doc.terminaux);
  if (current.length > 0) return current;

  const codes = splitLegacyList(doc.codeMachine);
  if (codes.length === 0) return [];
  const numeros = splitLegacyList(doc.numeroTpm);
  const legacyNumero = doc.numeroTpm?.trim();
  let pairedNumeros: string[] = [];
  if (numeros.length === codes.length) pairedNumeros = numeros;
  else if (codes.length === 1 && legacyNumero) pairedNumeros = [legacyNumero];
  return normalizeClientTerminaux(
    codes.map((codeMachine, index) => ({ codeMachine, numeroTpm: pairedNumeros[index] ?? null })),
  );
}

/** Ajoute les TPE entrants à la liste existante ; un N° TPM entrant complète ou remplace celui du même code. */
export function mergeClientTerminaux(
  existing: readonly ClientTerminal[],
  incoming: readonly ClientTerminal[],
): ClientTerminal[] {
  const merged = normalizeClientTerminaux(existing);
  const byCode = new Map(merged.map((terminal) => [terminal.codeMachine, terminal]));
  for (const terminal of normalizeClientTerminaux(incoming)) {
    const current = byCode.get(terminal.codeMachine);
    if (current) {
      if (terminal.numeroTpm) current.numeroTpm = terminal.numeroTpm;
      continue;
    }
    merged.push(terminal);
    byCode.set(terminal.codeMachine, terminal);
  }
  return merged;
}

export function clientTerminauxEqual(a: readonly ClientTerminal[], b: readonly ClientTerminal[]): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (terminal, index) =>
      terminal.codeMachine === b[index]?.codeMachine && terminal.numeroTpm === b[index]?.numeroTpm,
  );
}

/** Anciens champs dérivés, conservés pour la recherche et les documents existants. */
export function clientTerminauxLegacyFields(terminaux: readonly ClientTerminal[]): {
  codeMachine: string | null;
  numeroTpm: string | null;
  nombreTpm: number | null;
} {
  const first = terminaux[0];
  return {
    codeMachine: first?.codeMachine ?? null,
    numeroTpm: first?.numeroTpm ?? null,
    nombreTpm: terminaux.length > 0 ? terminaux.length : null,
  };
}

/** Ex. « TPE001 (TPM 12), TPE002 ». */
export function formatClientTerminaux(terminaux: readonly ClientTerminal[]): string {
  return terminaux
    .map((terminal) =>
      terminal.numeroTpm ? `${terminal.codeMachine} (TPM ${terminal.numeroTpm})` : terminal.codeMachine,
    )
    .join(", ");
}

export function formatClientTerminalCodes(terminaux: readonly ClientTerminal[]): string {
  return terminaux.map((terminal) => terminal.codeMachine).join(", ");
}

/** Champs « Code machine / N° TPM / Nombre de TPM » à afficher (contrats, fiches) : tous les TPE. */
export function clientTerminauxSummary(doc: {
  terminaux?: ReadonlyArray<{ codeMachine?: unknown; numeroTpm?: unknown }> | null;
  codeMachine?: string | null;
  numeroTpm?: string | null;
  nombreTpm?: number | null;
}): { codeMachine: string | null; numeroTpm: string | null; nombreTpm: number | null } {
  const terminaux = resolveClientTerminaux(doc);
  if (terminaux.length === 0) {
    return {
      codeMachine: null,
      numeroTpm: doc.numeroTpm?.trim() || null,
      nombreTpm: typeof doc.nombreTpm === "number" ? doc.nombreTpm : null,
    };
  }
  const numeros = terminaux.map((terminal) => terminal.numeroTpm).filter((n): n is string => Boolean(n));
  return {
    codeMachine: formatClientTerminalCodes(terminaux),
    numeroTpm: numeros.length > 0 ? numeros.join(", ") : null,
    nombreTpm: terminaux.length,
  };
}
