import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { badRequest } from "@/lib/api/error-responses";
import { enforceRateLimit, zodBadRequest } from "@/lib/api/endpoint-helpers";
import { requireApiAuth } from "@/lib/auth/guards";
import { importClientsFromRows } from "@/lib/lonaci/clients-import";

const MAX_ROWS = 2_000;

const bodySchema = z
  .object({
    rows: z.array(z.record(z.string(), z.unknown())).min(1).max(MAX_ROWS),
    /** Produit cible de l’import : chaque client créé est rattaché à ce produit. */
    produitCode: z.string().trim().min(1).max(32).optional(),
  })
  .strict();

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

function parseCsv(content: string): Record<string, unknown>[] {
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]!);
  if (headers.some((h) => !h)) throw new Error("En-têtes CSV invalides");
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    const row: Record<string, unknown> = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx] ?? "";
    });
    return row;
  });
}

function parseRowsFromJsonOrCsv(fileName: string, content: string): Record<string, unknown>[] {
  const lower = fileName.toLowerCase();
  const trimmed = content.trim();
  if (!trimmed) return [];
  if (lower.endsWith(".json")) {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) return parsed as Record<string, unknown>[];
    if (parsed && typeof parsed === "object") return [parsed as Record<string, unknown>];
    throw new Error("JSON invalide: attendu objet ou tableau");
  }
  if (lower.endsWith(".csv")) {
    return parseCsv(trimmed);
  }
  throw new Error("Format fichier non supporté côté API (utilisez .json ou .csv, ou Excel côté navigateur).");
}

export async function POST(request: NextRequest) {
  const rateLimitResponse = await enforceRateLimit(request, {
    namespace: "clients-import",
    max: 20,
    windowMs: 10 * 60 * 1000,
  });
  if (rateLimitResponse) return rateLimitResponse;

  const auth = await requireApiAuth(request, {
    roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
  });
  if ("error" in auth) return auth.error;

  const contentType = request.headers.get("content-type") ?? "";
  let rows: Record<string, unknown>[] = [];
  let produitCode: string | undefined;

  try {
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file");
      if (!(file instanceof File)) {
        return badRequest("Fichier manquant.", "FILE_REQUIRED");
      }
      const text = await file.text();
      rows = parseRowsFromJsonOrCsv(file.name, text);
      const produitRaw = formData.get("produitCode");
      if (typeof produitRaw === "string" && produitRaw.trim()) {
        produitCode = produitRaw.trim().toUpperCase();
      }
    } else {
      const parsed = bodySchema.safeParse(await request.json().catch(() => null));
      if (!parsed.success) {
        return zodBadRequest(parsed.error, "Payload d’import invalide");
      }
      rows = parsed.data.rows;
      produitCode = parsed.data.produitCode?.trim().toUpperCase();
    }
  } catch (error) {
    return badRequest(
      error instanceof Error ? error.message : "Fichier illisible",
      "IMPORT_PARSE_FAILED",
    );
  }

  if (!produitCode) {
    return badRequest(
      "Sélectionnez un produit avant d’importer (la liste est catégorisée par produit).",
      "PRODUIT_REQUIRED",
    );
  }

  if (rows.length === 0) {
    return badRequest("Aucune ligne à importer.", "IMPORT_EMPTY");
  }
  if (rows.length > MAX_ROWS) {
    return badRequest(`Trop de lignes (maximum ${MAX_ROWS}).`, "IMPORT_TOO_MANY_ROWS");
  }

  const summary = await importClientsFromRows(rows, auth.user, { produitCode });
  return NextResponse.json(
    {
      message: `Import terminé : chaque client a été rangé dans l’agence indiquée dans le fichier (produit ${produitCode}).`,
      produitCode,
      inserted: summary.inserted,
      updated: summary.updated,
      unchanged: summary.unchanged,
      skippedDuplicates: summary.skippedDuplicates,
      failed: summary.failed,
      results: summary.results.slice(0, 200),
    },
    { status: 200 },
  );
}
