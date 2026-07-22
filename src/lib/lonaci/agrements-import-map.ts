/**
 * Mapping Excel/CSV → champs agrément (navigateur + serveur).
 */

import {
  normalizeImportHeaderToken,
  pickImportField,
} from "@/lib/lonaci/clients-import-map";

export const AGREMENT_IMPORT_COLUMN_ORDER = [
  "referenceOfficielle",
  "dateReception",
  "agence",
  "produitCode",
  "lonaciClientId",
  "observations",
] as const;

export const AGREMENT_IMPORT_HEADER_LABELS: Record<
  (typeof AGREMENT_IMPORT_COLUMN_ORDER)[number],
  string
> = {
  referenceOfficielle: "Référence officielle",
  dateReception: "Date réception",
  agence: "Agence",
  produitCode: "Produit",
  lonaciClientId: "ID client Lonaci",
  observations: "Observations",
};

const FIELD_ALIASES: Record<(typeof AGREMENT_IMPORT_COLUMN_ORDER)[number], string[]> = {
  referenceOfficielle: [
    "referenceOfficielle",
    "Référence officielle",
    "reference officielle",
    "ref officielle",
    "numero officielle",
    "n° agrément",
    "numero agrement",
    "num agrement",
    "agrement",
    "agrément",
  ],
  dateReception: [
    "dateReception",
    "Date réception",
    "date reception",
    "date agrement",
    "date agrément",
    "date",
  ],
  agence: [
    "agence",
    "Agence",
    "Agence (zone)",
    "Agence (Intérieur - Abidjan)",
    "agenceId",
    "agenceCode",
    "codeAgence",
    "code agence",
    "zone",
  ],
  produitCode: [
    "produitCode",
    "Produit",
    "produit",
    "code produit",
    "product",
  ],
  lonaciClientId: [
    "lonaciClientId",
    "ID client Lonaci",
    "clientId",
    "id client",
    "concessionnaireId",
    "id concessionnaire",
  ],
  observations: [
    "observations",
    "Observations",
    "commentaire",
    "commentaires",
    "notes",
  ],
};

export type MappedAgrementImportRow = {
  referenceOfficielle: string;
  dateReception: string;
  agence: string;
  produitCode: string;
  lonaciClientId: string | null;
  observations: string | null;
};

function asCellString(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value).trim();
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return value.trim();
  return "";
}

function isGenericHeaderKey(key: string): boolean {
  return /^(__EMPTY|EMPTY|_?\d+)$/i.test(key.trim()) || /^\d+$/.test(key.trim());
}

function applyPositionalFallback(record: Record<string, unknown>): Record<string, unknown> {
  const keys = Object.keys(record);
  const recognized = keys.some((key) => {
    if (isGenericHeaderKey(key)) return false;
    const token = normalizeImportHeaderToken(key);
    return AGREMENT_IMPORT_COLUMN_ORDER.some((field) =>
      FIELD_ALIASES[field].some((alias) => normalizeImportHeaderToken(alias) === token),
    );
  });
  if (recognized) return record;

  const values = Object.values(record);
  const positional: Record<string, unknown> = {};
  AGREMENT_IMPORT_COLUMN_ORDER.forEach((field, index) => {
    positional[field] = values[index] ?? "";
  });
  return positional;
}

/** Parse une date Excel/CSV en ISO (YYYY-MM-DD ou datetime). */
export function parseAgrementImportDate(raw: string): Date | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Excel serial date (nombre de jours depuis 1899-12-30)
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const serial = Number(trimmed);
    if (serial > 20000 && serial < 80000) {
      const utc = Date.UTC(1899, 11, 30) + Math.round(serial * 86400000);
      const d = new Date(utc);
      if (!Number.isNaN(d.getTime())) return d;
    }
  }

  const isoTry = trimmed.includes("T") ? trimmed : trimmed.replace(/(\d{2})\/(\d{2})\/(\d{4})/, "$3-$2-$1");
  const d = new Date(isoTry);
  if (!Number.isNaN(d.getTime())) return d;

  const m = trimmed.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    const year = Number(m[3]);
    const local = new Date(year, month - 1, day);
    if (!Number.isNaN(local.getTime())) return local;
  }

  return null;
}

export function mapAgrementImportRowFromRecord(
  raw: Record<string, unknown>,
): MappedAgrementImportRow {
  const record = applyPositionalFallback(raw);
  const pick = (field: (typeof AGREMENT_IMPORT_COLUMN_ORDER)[number]) =>
    pickImportField(record, FIELD_ALIASES[field]);

  let agence = pick("agence");
  if (!agence) {
    for (const [key, value] of Object.entries(record)) {
      const token = normalizeImportHeaderToken(key);
      if (!token.includes("agence") && token !== "zone") continue;
      const text = asCellString(value);
      if (text) {
        agence = text;
        break;
      }
    }
  }

  return {
    referenceOfficielle: pick("referenceOfficielle"),
    dateReception: pick("dateReception"),
    agence,
    produitCode: pick("produitCode").toUpperCase(),
    lonaciClientId: pick("lonaciClientId") || null,
    observations: pick("observations") || null,
  };
}
