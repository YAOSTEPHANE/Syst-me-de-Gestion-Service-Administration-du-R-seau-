/**
 * Mapping Excel/CSV → champs client (côté navigateur et serveur).
 * Accepte les en-têtes techniques (codeMachine) et les libellés FR du tableau.
 */

export type MappedClientImportRow = {
  code: string;
  categorie: string;
  nomComplet: string;
  raisonSociale: string;
  codeMachine: string | null;
  cniNumero: string;
  nomContact: string | null;
  email: string | null;
  telephone: string | null;
  adresse: string | null;
  ville: string | null;
  codePostal: string | null;
  typeDistributeur: string | null;
  nombreTpm: string | null;
  numeroDistributeur: string | null;
  numeroTpm: string | null;
  agence: string;
  produitsAutorises: string;
  notes: string | null;
};

export function normalizeImportHeaderToken(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

/** Normalise un libellé/code d’agence pour matching souple à l’import. */
export function normalizeAgenceMatchToken(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[\s/-]+/g, "_")
    .replace(/^AGENCE_DE_/, "")
    .replace(/^AGENCE_/, "")
    .replace(/^AG_/, "");
}

type AgenceMatchable = {
  code: string;
  libelle: string;
  id?: string | null;
  _id?: string | null;
};

/**
 * Résout un token fichier (code, libellé, « Agence Abobo », etc.) vers une agence du référentiel.
 */
export function matchAgenceFromImportToken<T extends AgenceMatchable>(
  token: string,
  agences: T[],
): T | null {
  const normalized = normalizeAgenceMatchToken(token);
  if (!normalized || agences.length === 0) return null;

  const idOf = (a: T) => (a.id ?? a._id ?? "").trim();

  const byId = agences.find((a) => {
    const id = idOf(a);
    return id && normalizeAgenceMatchToken(id) === normalized;
  });
  if (byId) return byId;

  const byCode = agences.find((a) => normalizeAgenceMatchToken(a.code) === normalized);
  if (byCode) return byCode;

  const byLibelle = agences.find((a) => normalizeAgenceMatchToken(a.libelle) === normalized);
  if (byLibelle) return byLibelle;

  const parts = normalized.split("_").filter((p) => p.length >= 2);

  // Préfère le code le plus long présent comme segment (évite ABO vs ABOBO).
  const byCodeSegment = [...agences]
    .map((a) => ({ a, code: normalizeAgenceMatchToken(a.code) }))
    .filter(({ code }) => code.length >= 2 && parts.includes(code))
    .sort((x, y) => y.code.length - x.code.length);
  if (byCodeSegment[0]) return byCodeSegment[0].a;

  const byLibelleParts = agences.find((a) => {
    const libParts = normalizeAgenceMatchToken(a.libelle)
      .split("_")
      .filter((p) => p.length >= 2);
    return parts.some((p) => libParts.includes(p) && p.length >= 4);
  });
  if (byLibelleParts) return byLibelleParts;

  return (
    agences.find((a) => {
      const code = normalizeAgenceMatchToken(a.code);
      if (!code || code.length < 2) return false;
      return (
        normalized === `AGENCE_${code}` ||
        normalized.endsWith(`_${code}`) ||
        normalized.startsWith(`${code}_`)
      );
    }) ?? null
  );
}

/** Déduit le code agence depuis un identifiant `CLI-{AGENCE}-{suffix}`. */
export function inferAgenceCodeFromClientCode(rawCode: string): string | null {
  const trimmed = rawCode.trim().toUpperCase();
  if (!trimmed.startsWith("CLI-")) return null;
  const withoutCli = trimmed.slice(4);
  const dash = withoutCli.indexOf("-");
  if (dash <= 0) return null;
  const ag = withoutCli.slice(0, dash).trim();
  return ag || null;
}

function asCellString(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value).trim();
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return value.trim();
  return "";
}

/** Lit une cellule en matching souple sur les alias d’en-tête. */
export function pickImportField(
  record: Record<string, unknown>,
  aliases: string[],
): string {
  const normalizedMap = new Map<string, string>();
  for (const key of Object.keys(record)) {
    const token = normalizeImportHeaderToken(key);
    if (token && !normalizedMap.has(token)) {
      normalizedMap.set(token, key);
    }
  }
  for (const alias of aliases) {
    const hitKey = normalizedMap.get(normalizeImportHeaderToken(alias));
    if (!hitKey) continue;
    const text = asCellString(record[hitKey]);
    if (text) return text;
  }
  return "";
}

/**
 * Ordre des colonnes du modèle Excel (fallback si en-têtes absents / génériques).
 * Aligné sur le modèle téléchargeable et la liste clients.
 */
export const CLIENT_IMPORT_COLUMN_ORDER = [
  "code",
  "codeMachine",
  "categorie",
  "nomComplet",
  "raisonSociale",
  "cniNumero",
  "nomContact",
  "email",
  "telephone",
  "typeDistributeur",
  "nombreTpm",
  "numeroDistributeur",
  "numeroTpm",
  "adresse",
  "ville",
  "codePostal",
  "agence",
  "produitsAutorises",
  "notes",
] as const;

/** Libellés FR du modèle Excel (1re ligne), alignés sur le tableau. */
export const CLIENT_IMPORT_HEADER_LABELS: Record<
  (typeof CLIENT_IMPORT_COLUMN_ORDER)[number],
  string
> = {
  code: "Code",
  codeMachine: "Code machine",
  categorie: "Catégorie",
  nomComplet: "Nom complet",
  raisonSociale: "Raison sociale",
  cniNumero: "CNI",
  nomContact: "Contact",
  email: "Email",
  telephone: "Téléphone",
  typeDistributeur: "Type de distributeur",
  nombreTpm: "Nombre de TPM",
  numeroDistributeur: "N° Distributeur",
  numeroTpm: "N° TPM",
  adresse: "Adresse",
  ville: "Ville",
  codePostal: "Code postal",
  agence: "Agence (Intérieur - Abidjan)",
  produitsAutorises: "Produits",
  notes: "Notes",
};

const FIELD_ALIASES: Record<(typeof CLIENT_IMPORT_COLUMN_ORDER)[number], string[]> = {
  code: [
    "code",
    "Code",
    "identifiant",
    "codeClient",
    "code client",
    "code cli",
    "n client",
    "n° client",
    "numero client",
    "n°",
    "no",
    "ref",
    "référence",
    "reference",
    "matricule",
  ],
  codeMachine: [
    "codeMachine",
    "Code machine",
    "code machine",
    "codeTerminal",
    "code terminal",
    "terminal",
    "machine",
  ],
  categorie: ["categorie", "Catégorie", "categorie client", "typeClient", "type client"],
  nomComplet: [
    "nomComplet",
    "Nom complet",
    "nom",
    "noms",
    "nomPrenom",
    "nom prenom",
    "nom et prenom",
    "nom et prénom",
    "noms et prenoms",
    "nom du client",
    "nom client",
    "nom du concessionnaire",
    "nom concessionnaire",
    "Nom / Raison sociale",
    "nom raison sociale",
    "beneficiaire",
    "bénéficiaire",
    "client",
    "intitule",
    "intitulé",
    "designation",
    "désignation",
    "fullname",
    "fullnamecomplet",
    "fullname complete",
    "full name",
    "fullname",
    "pdv",
    "point de vente",
  ],
  raisonSociale: [
    "raisonSociale",
    "Raison sociale",
    "entreprise",
    "societe",
    "société",
    "enseigne",
  ],
  cniNumero: [
    "cniNumero",
    "CNI",
    "cni",
    "identifiantCni",
    "numeroCni",
    "n° cni",
    "numero cni",
    "piece identite",
    "pièce identité",
    "n° piece",
  ],
  nomContact: [
    "nomContact",
    "Contact",
    "contact",
    "contacts",
    "nom contact",
    "nom du contact",
    "contact client",
    "contact pdv",
    "contact / representant",
    "contact / représentant",
    "représentant",
    "representant",
    "interlocuteur",
    "personne a contacter",
    "personne à contacter",
    "personne contact",
    "gerant",
    "gérant",
    "responsable",
  ],
  email: ["email", "Email", "E-mail", "e-mail", "courriel", "mail", "adresse email", "adresse mail"],
  telephone: [
    "telephone",
    "Téléphone",
    "tel",
    "tél",
    "tél.",
    "mobile",
    "phone",
    "portable",
    "whatsapp",
    "n telephone",
    "n° telephone",
    "numero telephone",
  ],
  typeDistributeur: [
    "typeDistributeur",
    "Type de distributeur",
    "type de distributeur",
    "type distributeur",
    "typeConcession",
    "Type de concession",
    "type de concession",
    "type concession",
    "concession",
    "nouveau ou ancien",
  ],
  nombreTpm: ["nombreTpm", "Nombre de TPM", "nombre de tpm", "nb tpm", "nbtpm", "tpm count"],
  numeroDistributeur: [
    "numeroDistributeur",
    "N° Distributeur",
    "n distributeur",
    "numero distributeur",
    "n° distributeur",
    "distributeur",
  ],
  numeroTpm: [
    "numeroTpm",
    "N° TPM",
    "n tpm",
    "numero tpm",
    "n° tpm",
    "code tpm",
  ],
  adresse: ["adresse", "Adresse"],
  ville: ["ville", "Ville"],
  codePostal: ["codePostal", "Code postal", "cp", "postal"],
  agence: [
    "agence",
    "Agence",
    "Agence (zone)",
    "Agence (Intérieur - Abidjan)",
    "Agence (Interieur - Abidjan)",
    "agenceId",
    "agenceCode",
    "codeAgence",
    "code agence",
    "code_agence",
    "nom agence",
    "libelle agence",
    "libellé agence",
    "direction",
    "direction regionale",
    "direction régionale",
    "dr",
    "antenne",
    "site",
    "zone",
    "zone geographique",
    "zone géographique",
  ],
  produitsAutorises: [
    "produitsAutorises",
    "Produits",
    "produits",
    "produit",
    "product",
  ],
  notes: ["notes", "Notes", "observations", "commentaire"],
};

function isGenericHeaderKey(key: string): boolean {
  return /^(__EMPTY|EMPTY|_?\d+)$/i.test(key.trim()) || /^\d+$/.test(key.trim());
}

/**
 * Si la 1re ligne n’a pas d’en-têtes reconnus (A, B, 0, 1…), mappe par position
 * selon l’ordre du modèle Excel.
 */
function applyPositionalFallback(
  record: Record<string, unknown>,
): Record<string, unknown> {
  const keys = Object.keys(record);
  const recognized = keys.some((key) => {
    if (isGenericHeaderKey(key)) return false;
    const token = normalizeImportHeaderToken(key);
    return CLIENT_IMPORT_COLUMN_ORDER.some((field) =>
      FIELD_ALIASES[field].some((alias) => normalizeImportHeaderToken(alias) === token),
    );
  });
  if (recognized) return record;

  const values = Object.values(record);
  const positional: Record<string, unknown> = {};
  CLIENT_IMPORT_COLUMN_ORDER.forEach((field, index) => {
    positional[field] = values[index] ?? "";
  });
  return positional;
}

export function mapClientImportRowFromRecord(
  raw: Record<string, unknown>,
): MappedClientImportRow {
  const record = applyPositionalFallback(raw);
  const pick = (field: (typeof CLIENT_IMPORT_COLUMN_ORDER)[number]) =>
    pickImportField(record, FIELD_ALIASES[field]);

  const prenom = pickImportField(record, ["prenom", "prénom", "firstname", "first name"]);
  const nomSeul = pickImportField(record, ["nom de famille", "lastname", "last name", "surname"]);
  let nomComplet = pick("nomComplet");
  if (!nomComplet && (prenom || nomSeul)) {
    nomComplet = [nomSeul, prenom].filter(Boolean).join(" ").trim();
  }

  let nomContact = pick("nomContact");
  // En-têtes non listés mais contenant « contact » (ex. « Nom du contact PDV »)
  if (!nomContact) {
    for (const [key, value] of Object.entries(record)) {
      const token = normalizeImportHeaderToken(key);
      if (!token.includes("contact") || token.includes("contrat")) continue;
      const text = asCellString(value);
      if (text) {
        nomContact = text;
        break;
      }
    }
  }

  return {
    code: pick("code"),
    categorie: pick("categorie") || "PARTICULIER",
    nomComplet,
    raisonSociale: pick("raisonSociale"),
    codeMachine: pick("codeMachine") || null,
    cniNumero: pick("cniNumero"),
    nomContact: nomContact || null,
    email: pick("email") || null,
    telephone: pick("telephone") || null,
    adresse: pick("adresse") || null,
    ville: pick("ville") || null,
    codePostal: pick("codePostal") || null,
    typeDistributeur: pick("typeDistributeur") || null,
    nombreTpm: pick("nombreTpm") || null,
    numeroDistributeur: pick("numeroDistributeur") || null,
    numeroTpm: pick("numeroTpm") || null,
    agence: pick("agence"),
    produitsAutorises: pick("produitsAutorises"),
    notes: pick("notes") || null,
  };
}

export function isBlankMappedClientRow(row: MappedClientImportRow): boolean {
  return (
    !row.code &&
    !row.codeMachine &&
    !row.nomComplet &&
    !row.raisonSociale &&
    !row.cniNumero &&
    !row.agence &&
    !row.numeroDistributeur &&
    !row.numeroTpm &&
    !row.nomContact &&
    !row.telephone
  );
}

export function parseNombreTpm(value: string | null | undefined): number | null {
  if (value == null || value.trim() === "") return null;
  const n = Number(String(value).replace(",", ".").trim());
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.trunc(n));
}

/** Nettoie une valeur pour servir de suffixe d’identifiant client. */
function sanitizeCodeCandidate(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]+/g, "")
    .slice(0, 32);
}

/**
 * Déduit un code client si la colonne Code est absente/vide
 * (ex. fichier métier avec seulement Nom / N° Distributeur / Code machine).
 */
export function resolveImportClientCode(
  row: MappedClientImportRow,
  rowNumber: number,
): string {
  const direct = sanitizeCodeCandidate(row.code);
  if (direct) return direct;

  const fromMachine = sanitizeCodeCandidate(row.codeMachine ?? "");
  if (fromMachine) return fromMachine;

  const fromDistributeur = sanitizeCodeCandidate(row.numeroDistributeur ?? "");
  if (fromDistributeur) return fromDistributeur;

  const fromTpm = sanitizeCodeCandidate(row.numeroTpm ?? "");
  if (fromTpm) return fromTpm;

  const cniDigits = (row.cniNumero ?? "").replace(/\D/g, "");
  if (cniDigits.length >= 4) return cniDigits.slice(-8);

  return `IMP${String(Math.max(1, rowNumber)).padStart(5, "0")}`;
}

/**
 * Déduit un N° CNI minimal si absent (requis à la création).
 */
export function resolveImportCniNumero(
  row: MappedClientImportRow,
  resolvedCode: string,
): string {
  const direct = (row.cniNumero ?? "").trim();
  if (direct.length >= 4) return direct;
  const fromCode = sanitizeCodeCandidate(resolvedCode);
  if (fromCode.length >= 4) return `CNI-${fromCode}`.slice(0, 64);
  return `CNI-IMP${String(Date.now()).slice(-8)}`;
}

function looksLikePhoneOrEmail(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (v.includes("@")) return true;
  const digits = v.replace(/\D/g, "");
  return digits.length >= 8 && /^[+\d\s().\/-]+$/.test(v);
}

function looksLikePersonName(value: string): boolean {
  const v = value.trim();
  if (v.length < 2 || v.length > 120) return false;
  if (looksLikePhoneOrEmail(v)) return false;
  if (/^CLI-/i.test(v)) return false;
  if (/^\d+([.,]\d+)?$/.test(v)) return false;
  // Au moins 2 lettres (accents inclus)
  const letters = v.replace(/[^a-zA-ZÀ-ÿ]/g, "");
  return letters.length >= 2;
}

function cellAsString(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value).trim();
  if (typeof value === "string") return value.trim();
  return "";
}

/**
 * Déduit le nom affiché si la colonne « Nom complet » est absente
 * (Contact, raison sociale, en-tête contenant « nom », 1re valeur texte exploitable).
 */
export function resolveImportNomComplet(
  row: MappedClientImportRow,
  rawRecord?: Record<string, unknown>,
): string {
  const direct = row.nomComplet.trim();
  if (direct.length >= 2) return direct;

  const raison = row.raisonSociale.trim();
  if (raison.length >= 2) return raison;

  const contact = (row.nomContact ?? "").trim();
  if (contact.length >= 2) {
    const firstPart = contact.split(/[·|/;,]/)[0]?.trim() ?? contact;
    if (firstPart.length >= 2 && !looksLikePhoneOrEmail(firstPart)) {
      return firstPart;
    }
    if (!looksLikePhoneOrEmail(contact)) return contact;
  }

  if (rawRecord) {
    // En-têtes contenant "nom" / "client" / "benef"
    for (const [key, value] of Object.entries(rawRecord)) {
      const token = normalizeImportHeaderToken(key);
      if (!token) continue;
      if (token.includes("cni") || token.includes("code") || token.includes("tel")) continue;
      if (
        token.includes("nom") ||
        token.includes("client") ||
        token.includes("benef") ||
        token.includes("concessionnaire") ||
        token.includes("pdv")
      ) {
        const text = cellAsString(value);
        if (looksLikePersonName(text)) return text;
      }
    }

    // Dernier recours : première valeur texte qui ressemble à un nom
    for (const value of Object.values(rawRecord)) {
      const text = cellAsString(value);
      if (looksLikePersonName(text)) return text;
    }
  }

  return "";
}

/** Liste courte des en-têtes présents (pour messages d’erreur). */
export function listImportRowHeaders(raw: Record<string, unknown>, limit = 8): string {
  return Object.keys(raw)
    .filter((key) => !isGenericHeaderKey(key))
    .slice(0, limit)
    .join(", ");
}
