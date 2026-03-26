import { NextRequest, NextResponse } from "next/server";

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

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(request, { roles: ["CHEF_SERVICE"] });
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

  const db = await getDatabase();
  const now = new Date();

  if (modeRaw === "insert") {
    const docs = rows.map((row) => ({
      ...row,
      createdAt: (row.createdAt as unknown) ?? now,
      updatedAt: (row.updatedAt as unknown) ?? now,
    }));
    const res = await db.collection(collection).insertMany(docs);
    return NextResponse.json(
      { message: "Import terminé", mode: "insert", collection, inserted: res.insertedCount },
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
    const updateData: Record<string, unknown> = { ...row, updatedAt: now };
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
    { message: "Import terminé", mode: "upsert", collection, upserted, modified },
    { status: 200 },
  );
}
