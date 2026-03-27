import { NextRequest, NextResponse } from "next/server";
import { MongoBulkWriteError } from "mongodb";

import { requireApiAuth } from "@/lib/auth/guards";
import { getDatabase } from "@/lib/mongodb";

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((v) => v.trim());
}

function coerceCsvValue(value: string): unknown {
  if (value === "") return null;
  const lower = value.toLowerCase();
  if (lower === "true") return true;
  if (lower === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    const n = Number(value);
    if (!Number.isNaN(n)) return n;
  }
  return value;
}

function isIsoDateString(v: string): boolean {
  // Accepte: YYYY-MM-DD, ou YYYY-MM-DDTHH:mm:ss(.sss)Z(+/-HH:mm)
  return /^(\d{4}-\d{2}-\d{2})([T ][0-9:.+-Z]+)?$/.test(v.trim());
}

const DATE_KEYS_TO_COERCE = new Set<string>([
  "createdAt",
  "updatedAt",
  "deletedAt",
  "dateReception",
  "dateDemande",
  "dateOperation",
  "dateEffet",
  "dateDeces",
  "dueDate",
  "paidAt",
  "finalizedAt",
  "controlledAt",
  "transmittedAt",
  "expiresAt",
  "signedAt",
  "actedAt",
]);

function coerceDatesInValue(value: unknown, keyName?: string): unknown {
  if (Array.isArray(value)) {
    return value.map((v) => coerceDatesInValue(v));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = coerceDatesInValue(v, k);
    }
    return out;
  }
  if (typeof value === "string" && keyName && DATE_KEYS_TO_COERCE.has(keyName) && isIsoDateString(value)) {
    const t = Date.parse(value);
    if (!Number.isNaN(t)) return new Date(t);
  }
  return value;
}

function coerceDatesInRecord(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = coerceDatesInValue(v, k);
  }
  return out;
}

function parseCsv(content: string): Record<string, unknown>[] {
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]);
  if (headers.some((h) => !h)) {
    throw new Error("En-têtes CSV invalides");
  }

  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    const row: Record<string, unknown> = {};
    headers.forEach((header, idx) => {
      row[header] = coerceCsvValue(values[idx] ?? "");
    });
    return row;
  });
}

function parseFromFile(fileName: string, content: string): Record<string, unknown>[] {
  const lowerName = fileName.toLowerCase();
  const trimmed = content.trim();
  if (!trimmed) return [];

  if (lowerName.endsWith(".json")) {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) return parsed as Record<string, unknown>[];
    if (parsed && typeof parsed === "object") return [parsed as Record<string, unknown>];
    throw new Error("JSON invalide: attendu objet ou tableau d'objets");
  }

  if (lowerName.endsWith(".csv")) {
    return parseCsv(trimmed);
  }

  throw new Error("Format non supporté. Utilisez .json ou .csv");
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isObjectIdLike(v: unknown): boolean {
  return typeof v === "string" && /^[a-f\d]{24}$/i.test(v.trim());
}

function normalizeEnum<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  if (!isNonEmptyString(value)) return null;
  const upper = value.trim().toUpperCase();
  const found = allowed.find((a) => a === upper);
  return found ?? null;
}

function validateAndNormalizeImportRow(
  collection: string,
  row: Record<string, unknown>,
): { row: Record<string, unknown> | null; error?: string } {
  const normalized = { ...row };

  if (collection === "cessions") {
    const kind = normalizeEnum(normalized.kind, ["CESSION", "DELOCALISATION"] as const);
    if (!kind) return { row: null, error: "kind invalide (CESSION|DELOCALISATION)" };
    normalized.kind = kind;

    const statut = normalizeEnum(
      normalized.statut ?? "SAISIE_AGENT",
      ["SAISIE_AGENT", "CONTROLE_CHEF_SECTION", "VALIDEE_CHEF_SERVICE", "REJETEE"] as const,
    );
    if (!statut) return { row: null, error: "statut invalide pour cession" };
    normalized.statut = statut;

    if (kind === "CESSION") {
      if (!isObjectIdLike(normalized.cedantId)) return { row: null, error: "cedantId requis (ObjectId)" };
      if (!isObjectIdLike(normalized.beneficiaireId))
        return { row: null, error: "beneficiaireId requis (ObjectId)" };
      if (!isNonEmptyString(normalized.produitCode)) return { row: null, error: "produitCode requis" };
      normalized.produitCode = normalized.produitCode.trim().toUpperCase();
    }
    if (kind === "DELOCALISATION") {
      if (!isObjectIdLike(normalized.concessionnaireId))
        return { row: null, error: "concessionnaireId requis (ObjectId)" };
      if (!isObjectIdLike(normalized.oldAgenceId)) return { row: null, error: "oldAgenceId requis (ObjectId)" };
      if (!isObjectIdLike(normalized.newAgenceId)) return { row: null, error: "newAgenceId requis (ObjectId)" };
      if (!isNonEmptyString(normalized.oldAdresse) || !isNonEmptyString(normalized.newAdresse)) {
        return { row: null, error: "oldAdresse/newAdresse requis" };
      }
    }
    if (!isNonEmptyString(normalized.motif)) return { row: null, error: "motif requis" };
    return { row: normalized };
  }

  if (collection === "resiliations") {
    if (!isObjectIdLike(normalized.concessionnaireId))
      return { row: null, error: "concessionnaireId requis (ObjectId)" };
    if (!isNonEmptyString(normalized.produitCode)) return { row: null, error: "produitCode requis" };
    normalized.produitCode = normalized.produitCode.trim().toUpperCase();
    if (!isNonEmptyString(normalized.motif)) return { row: null, error: "motif requis" };
    const statut = normalizeEnum(normalized.statut ?? "DOSSIER_RECU", ["DOSSIER_RECU", "RESILIE"] as const);
    if (!statut) return { row: null, error: "statut invalide pour résiliation" };
    normalized.statut = statut;
    return { row: normalized };
  }

  if (collection === "attestations_domiciliation") {
    const type = normalizeEnum(
      normalized.type ?? "ATTESTATION_REVENU",
      ["ATTESTATION_REVENU", "DOMICILIATION_PRODUIT"] as const,
    );
    if (!type) return { row: null, error: "type invalide (ATTESTATION_REVENU|DOMICILIATION_PRODUIT)" };
    normalized.type = type;
    if (normalized.concessionnaireId != null && normalized.concessionnaireId !== "" && !isObjectIdLike(normalized.concessionnaireId)) {
      return { row: null, error: "concessionnaireId invalide (ObjectId)" };
    }
    if (isNonEmptyString(normalized.produitCode)) normalized.produitCode = normalized.produitCode.trim().toUpperCase();
    const statut = normalizeEnum(normalized.statut ?? "DEMANDE_RECUE", ["DEMANDE_RECUE", "TRANSMIS", "FINALISE"] as const);
    if (!statut) return { row: null, error: "statut invalide pour attestation/domiciliation" };
    normalized.statut = statut;
    return { row: normalized };
  }

  if (collection === "bancarisation_requests") {
    if (!isObjectIdLike(normalized.concessionnaireId))
      return { row: null, error: "concessionnaireId requis (ObjectId)" };
    if (normalized.agenceId != null && normalized.agenceId !== "" && !isObjectIdLike(normalized.agenceId)) {
      return { row: null, error: "agenceId invalide (ObjectId)" };
    }
    if (isNonEmptyString(normalized.produitCode)) normalized.produitCode = normalized.produitCode.trim().toUpperCase();
    const statutActuel = normalizeEnum(normalized.statutActuel ?? "NON_BANCARISE", ["NON_BANCARISE", "EN_COURS", "BANCARISE"] as const);
    const nouveauStatut = normalizeEnum(normalized.nouveauStatut ?? "EN_COURS", ["NON_BANCARISE", "EN_COURS", "BANCARISE"] as const);
    const status = normalizeEnum(normalized.status ?? "SOUMIS", ["SOUMIS", "VALIDE", "REJETE"] as const);
    if (!statutActuel || !nouveauStatut || !status) {
      return { row: null, error: "statuts bancarisation invalides" };
    }
    normalized.statutActuel = statutActuel;
    normalized.nouveauStatut = nouveauStatut;
    normalized.status = status;
    if (nouveauStatut === "BANCARISE" && !isNonEmptyString(normalized.compteBancaire)) {
      return { row: null, error: "compteBancaire requis pour nouveauStatut=BANCARISE" };
    }
    return { row: normalized };
  }

  return { row: normalized };
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(request, {
    roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
  });
  if ("error" in auth) {
    return auth.error;
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ message: "Requête invalide" }, { status: 400 });
  }

  const file = formData.get("file");
  const collection = String(formData.get("collection") ?? "").trim();
  const modeRaw = String(formData.get("mode") ?? "insert").trim().toLowerCase();
  const upsertByRaw = String(formData.get("upsertBy") ?? "").trim();
  const agenceIdRaw = String(formData.get("agenceId") ?? "").trim();

  if (!(file instanceof File)) {
    return NextResponse.json({ message: "Fichier manquant" }, { status: 400 });
  }
  if (!collection) {
    return NextResponse.json({ message: "Collection manquante" }, { status: 400 });
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(collection)) {
    return NextResponse.json({ message: "Nom de collection invalide" }, { status: 400 });
  }
  if (modeRaw !== "insert" && modeRaw !== "upsert") {
    return NextResponse.json({ message: "Mode invalide (insert ou upsert)" }, { status: 400 });
  }
  if (modeRaw === "upsert" && !upsertByRaw) {
    return NextResponse.json({ message: "Champ upsert requis en mode upsert" }, { status: 400 });
  }

  const text = await file.text();
  let rows: Record<string, unknown>[] = [];
  try {
    rows = parseFromFile(file.name, text);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Fichier invalide";
    return NextResponse.json({ message }, { status: 400 });
  }

  if (rows.length === 0) {
    return NextResponse.json({ message: "Aucune ligne à importer", inserted: 0 }, { status: 200 });
  }

  // Conversion ISO string -> Date sur les champs de date connus.
  rows = rows.map((r) => coerceDatesInRecord(r));

  // Validation métier collection-spécifique : on écarte les lignes invalides,
  // puis on renvoie un rapport (index + raison) pour faciliter la correction du fichier.
  const invalidRows: Array<{ index: number; reason: string }> = [];
  const validRows: Record<string, unknown>[] = [];
  rows.forEach((row, idx) => {
    const checked = validateAndNormalizeImportRow(collection, row);
    if (!checked.row) {
      invalidRows.push({ index: idx + 1, reason: checked.error ?? "Ligne invalide" });
      return;
    }
    validRows.push(checked.row);
  });
  rows = validRows;
  if (rows.length === 0) {
    return NextResponse.json(
      {
        message: "Aucune ligne valide à importer",
        mode: modeRaw,
        collection,
        inserted: 0,
        upserted: 0,
        modified: 0,
        skippedInvalidRows: invalidRows.length,
        invalidRows: invalidRows.slice(0, 25),
      },
      { status: 400 },
    );
  }

  const db = await getDatabase();
  const now = new Date();
  const agencePatch = agenceIdRaw ? { agenceId: agenceIdRaw } : {};

  function normalizeCode(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const v = value.trim();
    return v.length > 0 ? v : null;
  }

  if (modeRaw === "insert") {
    if (collection === "agences") {
      const rowsWithCode = rows.filter((row) => normalizeCode(row.code) !== null);
      const skippedInvalidCode = rows.length - rowsWithCode.length;

      // Deduplique les lignes par code dans le fichier (on garde la premiere occurrence).
      const seenCodes = new Set<string>();
      const dedupedRows: Record<string, unknown>[] = [];
      let skippedFileDuplicates = 0;
      for (const row of rowsWithCode) {
        const code = normalizeCode(row.code) as string;
        if (seenCodes.has(code)) {
          skippedFileDuplicates += 1;
          continue;
        }
        seenCodes.add(code);
        dedupedRows.push(row);
      }

      // Ignore aussi les codes deja presents en base pour eviter les collisions unique index.
      const existingRows = await db
        .collection(collection)
        .find({ code: { $in: [...seenCodes] } }, { projection: { code: 1 } })
        .toArray();
      const existingCodes = new Set(
        existingRows
          .map((row) => normalizeCode((row as Record<string, unknown>).code))
          .filter((code): code is string => code !== null),
      );
      const finalRows = dedupedRows.filter((row) => !existingCodes.has(normalizeCode(row.code) as string));
      const skippedExistingDuplicates = dedupedRows.length - finalRows.length;

      if (finalRows.length === 0) {
        return NextResponse.json(
          {
            message: "Import terminé: aucune nouvelle ligne à insérer.",
            mode: "insert",
            collection,
            inserted: 0,
            skippedInvalidRows: invalidRows.length,
            invalidRows: invalidRows.slice(0, 25),
            skippedInvalidCode,
            skippedFileDuplicates,
            skippedExistingDuplicates,
          },
          { status: 200 },
        );
      }

      const docs = finalRows.map((row) => ({
        ...row,
        ...agencePatch,
        createdAt: (row.createdAt as unknown) ?? now,
        updatedAt: (row.updatedAt as unknown) ?? now,
      }));
      let insertedCount = 0;
      let skippedDbDuplicates = 0;
      try {
        const res = await db.collection(collection).insertMany(docs, { ordered: false });
        insertedCount = res.insertedCount;
      } catch (error) {
        if (error instanceof MongoBulkWriteError && error.code === 11000) {
          insertedCount = error.result.insertedCount;
          skippedDbDuplicates = Array.isArray(error.writeErrors)
            ? error.writeErrors.filter((w) => w.code === 11000).length
            : 0;
        } else {
          throw error;
        }
      }
      return NextResponse.json(
        {
          message: "Import terminé",
          mode: "insert",
          collection,
          inserted: insertedCount,
          skippedInvalidRows: invalidRows.length,
          invalidRows: invalidRows.slice(0, 25),
          skippedInvalidCode,
          skippedFileDuplicates,
          skippedExistingDuplicates: skippedExistingDuplicates + skippedDbDuplicates,
        },
        { status: 200 },
      );
    }

    const docs = rows.map((row) => ({
      ...row,
      ...agencePatch,
      createdAt: (row.createdAt as unknown) ?? now,
      updatedAt: (row.updatedAt as unknown) ?? now,
    }));
    let insertedCount = 0;
    let skippedExistingDuplicates = 0;
    try {
      const res = await db.collection(collection).insertMany(docs, { ordered: false });
      insertedCount = res.insertedCount;
    } catch (error) {
      if (error instanceof MongoBulkWriteError && error.code === 11000) {
        insertedCount = error.result.insertedCount;
        skippedExistingDuplicates = Array.isArray(error.writeErrors)
          ? error.writeErrors.filter((w) => w.code === 11000).length
          : 0;
      } else {
        throw error;
      }
    }
    return NextResponse.json(
      {
        message: "Import terminé",
        mode: "insert",
        collection,
        inserted: insertedCount,
        skippedInvalidRows: invalidRows.length,
        invalidRows: invalidRows.slice(0, 25),
        skippedExistingDuplicates,
      },
      { status: 200 },
    );
  }

  const upsertKey = upsertByRaw;
  let upserted = 0;
  let modified = 0;

  for (const row of rows) {
    const keyValue = row[upsertKey];
    if (keyValue === undefined || keyValue === null || keyValue === "") {
      return NextResponse.json(
        { message: `Champ "${upsertKey}" manquant sur une ligne` },
        { status: 400 },
      );
    }
    const updateData: Record<string, unknown> = { ...row, ...agencePatch, updatedAt: now };
    const res = await db.collection(collection).updateOne(
      { [upsertKey]: keyValue },
      {
        $set: updateData,
        $setOnInsert: { createdAt: now },
      },
      { upsert: true },
    );
    if (res.upsertedCount > 0) upserted += 1;
    if (res.modifiedCount > 0) modified += 1;
  }

  return NextResponse.json(
    {
      message: "Import terminé",
      mode: "upsert",
      collection,
      upserted,
      modified,
      skippedInvalidRows: invalidRows.length,
      invalidRows: invalidRows.slice(0, 25),
    },
    { status: 200 },
  );
}
