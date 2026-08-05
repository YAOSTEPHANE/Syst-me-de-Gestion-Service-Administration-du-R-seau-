/**
 * Mapping Excel/CSV → champs soumission (navigateur + serveur).
 */

import { normalizeImportHeaderToken } from "@/lib/lonaci/clients-import-map";
import {
  normalizeSoumissionStatut,
  type SoumissionStatut,
} from "@/lib/lonaci/soumission-constants";

export const SOUMISSION_IMPORT_COLUMN_ORDER = [
  "nomComplet",
  "contact",
  "typeDistributeur",
  "nombreTpe",
  "agence",
  "produitCode",
  "statut",
  "date",
  "observations",
] as const;

export const SOUMISSION_IMPORT_HEADER_LABELS: Record<
  (typeof SOUMISSION_IMPORT_COLUMN_ORDER)[number],
  string
> = {
  nomComplet: "Nom complet",
  contact: "Contact",
  typeDistributeur: "Type de distributeur",
  nombreTpe: "Nombre de TPE",
  agence: "Agence",
  produitCode: "Produit",
  statut: "Statut",
  date: "Date",
  observations: "Observation",
};

const FIELD_ALIASES: Record<(typeof SOUMISSION_IMPORT_COLUMN_ORDER)[number], string[]> = {
  nomComplet: [
    "nomComplet",
    "Nom complet",
    "nom complet",
    "noms et prenoms",
    "noms et prénoms",
    "nom et prenom",
    "nom et prénom",
    "nom prenom",
    "nom prénom",
    "nom & prenom",
    "nom & prénom",
    "prenom nom",
    "prénom nom",
    "identité",
    "identite",
    "prospect",
    "client",
    "beneficiaire",
    "bénéficiaire",
    "raison sociale",
    "raisonSociale",
    "distributeur",
    "nom distributeur",
    "nom du distributeur",
    "nom",
    "Nom",
  ],
  contact: [
    "contact",
    "Contact",
    "telephone",
    "téléphone",
    "tel",
    "Tél",
    "Tél.",
    "mobile",
    "whatsapp",
    "numero",
    "numéro",
    "n telephone",
    "n° telephone",
    "n° téléphone",
    "n tel",
    "n° tel",
    "ntel",
    "num tel",
    "numéro de téléphone",
    "numero de telephone",
    "n° de téléphone",
    "cel",
    "cellulaire",
    "portable",
    "gsm",
    "phone",
    "phonenumber",
    "msisdn",
  ],
  typeDistributeur: [
    "typeDistributeur",
    "Type de distributeur",
    "type distributeur",
    "type de distributeur",
  ],
  nombreTpe: [
    "nombreTpe",
    "Nombre de TPE",
    "nombre de tpe",
    "nb tpe",
    "nbre tpe",
    "tpe",
    "nombreTpm",
    "nombre de tpm",
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
    "codeProduit",
    "product",
    "productCode",
  ],
  statut: ["statut", "Statut", "status", "etat", "état", "pipeline"],
  date: ["date", "Date", "date appel", "date contact", "dateSoumission"],
  observations: [
    "observations",
    "Observation",
    "Observations",
    "commentaire",
    "commentaires",
    "notes",
    "remarque",
  ],
};

const APPELE_ALIASES = [
  "appele",
  "Appelé",
  "appelee",
  "appelé",
  "deja appele",
  "déjà appelé",
  "called",
];

export type MappedSoumissionImportRow = {
  nomComplet: string;
  contact: string;
  typeDistributeur: string;
  nombreTpe: string;
  agence: string;
  produitCode: string;
  statut: string;
  date: string;
  observations: string | null;
  /** null = colonne absente / vide → défaut non appelé à l’import. */
  appele: boolean | null;
};

function asCellString(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    // Téléphones Excel souvent en nombre entier (ex. 700110001 / 2250700110001).
    if (Math.abs(value) >= 1e7 && Math.abs(value) < 1e16) {
      const rounded = Math.round(value);
      if (Math.abs(value - rounded) < 1e-6) {
        return rounded.toLocaleString("fullwide", { useGrouping: false });
      }
    }
    return String(value).trim();
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof value === "string") return value.trim();
  return "";
}

export function parseSoumissionImportAppele(raw: string): boolean | null {
  const v = raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
  if (!v) return null;
  if (["oui", "o", "yes", "y", "true", "1", "appele", "x"].includes(v)) return true;
  if (["non", "n", "no", "false", "0", "non appele"].includes(v)) return false;
  return null;
}

function isGenericHeaderKey(key: string): boolean {
  return /^(__EMPTY|EMPTY|_?\d+)$/i.test(key.trim()) || /^\d+$/.test(key.trim());
}

function looksLikeNameHeaderToken(token: string): boolean {
  if (!token) return false;
  if (
    token.startsWith("nombre") ||
    token.includes("numero") ||
    token.includes("telephone") ||
    token.includes("tel") ||
    token.includes("mobile") ||
    token.includes("whatsapp") ||
    token.includes("contact") ||
    token.includes("agence") ||
    token.includes("statut") ||
    token.includes("date") ||
    token.includes("observation") ||
    token.includes("commentaire") ||
    token.includes("tpe") ||
    token.includes("tpm") ||
    token.includes("appele") ||
    token === "type" ||
    token.includes("typededistributeur")
  ) {
    return false;
  }
  if (token === "nom" || token.startsWith("nom")) return true;
  if (token.includes("prenom")) return true;
  if (token.includes("identit")) return true;
  if (token.includes("prospect") || token.includes("beneficia")) return true;
  if (token.includes("raisonsociale") || token === "client") return true;
  if (token.includes("distributeur") && !token.includes("type")) return true;
  return false;
}

function looksLikeContactHeaderToken(token: string): boolean {
  if (!token) return false;
  if (
    token.includes("nombre") ||
    token.includes("tpe") ||
    token.includes("tpm") ||
    token.includes("agence") ||
    token.includes("statut") ||
    token.includes("date") ||
    token.includes("observation") ||
    token.includes("commentaire") ||
    token.includes("appele") ||
    token.includes("prenom") ||
    token.includes("identit") ||
    token.includes("prospect") ||
    token.includes("raisonsociale") ||
    token.includes("produit")
  ) {
    return false;
  }
  if (token === "nom" || (token.startsWith("nom") && !token.includes("numero"))) {
    return false;
  }
  return (
    token.includes("contact") ||
    token.includes("tel") ||
    token.includes("phone") ||
    token.includes("mobile") ||
    token.includes("whatsapp") ||
    token.includes("gsm") ||
    token.includes("portable") ||
    token.includes("cellulaire") ||
    token === "cel" ||
    token.includes("msisdn") ||
    token === "numero" ||
    token.startsWith("numero") ||
    token.startsWith("ntel") ||
    token === "n"
  );
}

function normalizePhoneCandidate(text: string): string {
  return text.replace(/[\s.()/-]/g, "").replace(/^00/, "+");
}

function looksLikePhoneValue(text: string): boolean {
  const compact = normalizePhoneCandidate(text);
  if (/^\+?\d{8,15}$/.test(compact)) return true;
  // Numéro local CI souvent saisi 0XXXXXXXXX (10) ou sans 0 (9–10).
  if (/^0?\d{8,10}$/.test(compact)) return true;
  return false;
}

function looksLikeAgencyOrCodeValue(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/^[A-Z]{2,10}$/i.test(t) && t.length <= 10) return true;
  return false;
}

function applyPositionalFallback(record: Record<string, unknown>): Record<string, unknown> {
  const keys = Object.keys(record);
  const recognized = keys.some((key) => {
    if (isGenericHeaderKey(key)) return false;
    const token = normalizeImportHeaderToken(key);
    if (APPELE_ALIASES.some((alias) => normalizeImportHeaderToken(alias) === token)) return true;
    if (looksLikeNameHeaderToken(token)) return true;
    if (looksLikeContactHeaderToken(token)) return true;
    return SOUMISSION_IMPORT_COLUMN_ORDER.some((field) =>
      FIELD_ALIASES[field].some((alias) => normalizeImportHeaderToken(alias) === token),
    );
  });
  if (recognized) return record;

  const values = Object.values(record);
  const positional: Record<string, unknown> = {};
  SOUMISSION_IMPORT_COLUMN_ORDER.forEach((field, index) => {
    positional[field] = values[index] ?? "";
  });
  return positional;
}

function forcePositionalRecord(record: Record<string, unknown>): Record<string, unknown> {
  const values = Object.values(record);
  const positional: Record<string, unknown> = {};
  SOUMISSION_IMPORT_COLUMN_ORDER.forEach((field, index) => {
    positional[field] = values[index] ?? "";
  });
  return positional;
}

/** Parse une date Excel/CSV. */
export function parseSoumissionImportDate(raw: string): Date | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const serial = Number(trimmed);
    if (serial > 20000 && serial < 80000) {
      const utc = Date.UTC(1899, 11, 30) + Math.round(serial * 86400000);
      const d = new Date(utc);
      if (!Number.isNaN(d.getTime())) return d;
    }
  }

  const isoTry = trimmed.includes("T")
    ? trimmed
    : trimmed.replace(/(\d{2})\/(\d{2})\/(\d{4})/, "$3-$2-$1");
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

export function parseNombreTpe(raw: string): number | null {
  const trimmed = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

function pickByAliases(record: Record<string, unknown>, aliases: string[]): string {
  const normalizedMap = new Map<string, string>();
  for (const key of Object.keys(record)) {
    const token = normalizeImportHeaderToken(key);
    if (token && !normalizedMap.has(token)) normalizedMap.set(token, key);
  }
  for (const alias of aliases) {
    const hitKey = normalizedMap.get(normalizeImportHeaderToken(alias));
    if (!hitKey) continue;
    const text = asCellString(record[hitKey]);
    if (text) return text;
  }
  return "";
}

function inferNomComplet(record: Record<string, unknown>, alreadyPicked: string): string {
  if (alreadyPicked.trim().length >= 2) return alreadyPicked.trim();

  for (const [key, value] of Object.entries(record)) {
    if (isGenericHeaderKey(key)) continue;
    const token = normalizeImportHeaderToken(key);
    if (!looksLikeNameHeaderToken(token)) continue;
    const text = asCellString(value);
    if (text.length >= 2 && !looksLikePhoneValue(text)) return text;
  }

  for (const [key, value] of Object.entries(record)) {
    if (!isGenericHeaderKey(key)) continue;
    const text = asCellString(value);
    if (text.length < 2) continue;
    if (looksLikePhoneValue(text) || looksLikeAgencyOrCodeValue(text)) continue;
    if (/^\d+([.,]\d+)?$/.test(text)) continue;
    if (parseSoumissionImportDate(text)) continue;
    const lower = text.toLowerCase();
    if (["oui", "non", "nouveau", "ancien", "true", "false"].includes(lower)) continue;
    return text;
  }

  // Dernier recours : première valeur texte « humaine » de la ligne.
  for (const value of Object.values(record)) {
    const text = asCellString(value);
    if (text.length < 2) continue;
    if (looksLikePhoneValue(text) || looksLikeAgencyOrCodeValue(text)) continue;
    if (/^\d+([.,]\d+)?$/.test(text)) continue;
    if (parseSoumissionImportDate(text)) continue;
    const lower = text.toLowerCase();
    if (["oui", "non", "nouveau", "ancien", "true", "false"].includes(lower)) continue;
    if (/^[A-Z_]+$/.test(text) && text.includes("_")) continue;
    return text;
  }

  return "";
}

function inferContact(record: Record<string, unknown>, alreadyPicked: string): string {
  const picked = alreadyPicked.trim();
  if (picked.length >= 4) return picked;

  for (const [key, value] of Object.entries(record)) {
    if (isGenericHeaderKey(key)) continue;
    const token = normalizeImportHeaderToken(key);
    if (!looksLikeContactHeaderToken(token)) continue;
    const text = asCellString(value);
    if (text.length >= 4) return text;
  }

  for (const [key, value] of Object.entries(record)) {
    if (!isGenericHeaderKey(key)) continue;
    const text = asCellString(value);
    if (looksLikePhoneValue(text)) return text;
  }

  for (const value of Object.values(record)) {
    const text = asCellString(value);
    if (looksLikePhoneValue(text)) return text;
  }

  return picked;
}

function mapFromRecord(record: Record<string, unknown>): MappedSoumissionImportRow {
  const pick = (field: (typeof SOUMISSION_IMPORT_COLUMN_ORDER)[number]) =>
    pickByAliases(record, FIELD_ALIASES[field]);

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

  const nomFromAliases = pick("nomComplet");
  const contactFromAliases = pick("contact");
  const appeleRaw = pickByAliases(record, APPELE_ALIASES);

  return {
    nomComplet: inferNomComplet(record, nomFromAliases),
    contact: inferContact(record, contactFromAliases),
    typeDistributeur: pick("typeDistributeur"),
    nombreTpe: pick("nombreTpe"),
    agence,
    produitCode: pick("produitCode").toUpperCase(),
    statut: pick("statut"),
    date: pick("date"),
    observations: pick("observations") || null,
    appele: parseSoumissionImportAppele(appeleRaw),
  };
}

export function mapSoumissionImportRowFromRecord(
  raw: Record<string, unknown>,
): MappedSoumissionImportRow {
  const record = applyPositionalFallback(raw);
  const mapped = mapFromRecord(record);

  const nomOk = mapped.nomComplet.trim().length >= 2;
  const contactOk = mapped.contact.trim().length >= 4;
  if (nomOk && contactOk) return mapped;

  // En-têtes partiels : compléter les champs manquants via l’ordre des colonnes.
  const positional = forcePositionalRecord(raw);
  const mappedPositional = mapFromRecord(positional);
  return {
    nomComplet: nomOk ? mapped.nomComplet : mappedPositional.nomComplet || mapped.nomComplet,
    contact: contactOk ? mapped.contact : mappedPositional.contact || mapped.contact,
    typeDistributeur: mapped.typeDistributeur || mappedPositional.typeDistributeur,
    nombreTpe: mapped.nombreTpe || mappedPositional.nombreTpe,
    agence: mapped.agence || mappedPositional.agence,
    produitCode: mapped.produitCode || mappedPositional.produitCode,
    statut: mapped.statut || mappedPositional.statut,
    date: mapped.date || mappedPositional.date,
    observations: mapped.observations || mappedPositional.observations,
    appele: mapped.appele ?? mappedPositional.appele,
  };
}

export function resolveImportSoumissionStatut(raw: string): SoumissionStatut | null {
  return normalizeSoumissionStatut(raw);
}
