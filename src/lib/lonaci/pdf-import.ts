"use client";

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function aliasToRegex(alias: string): string {
  return escapeRegex(alias.trim()).replace(/\s+/g, "\\s+");
}

export async function extractPdfText(file: File, maxPages = 8): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/legacy/build/pdf.worker.min.mjs`;
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const pageCount = Math.min(doc.numPages, Math.max(1, maxPages));
  let content = "";
  for (let i = 1; i <= pageCount; i += 1) {
    const page = await doc.getPage(i);
    const text = await page.getTextContent();
    const pageText = text.items.map((item) => ("str" in item ? item.str : "")).join(" ");
    content += ` ${pageText}`;
  }
  const normalized = content.replace(/\s+/g, " ").trim();
  if (!normalized) throw new Error("Aucun texte lisible trouvé dans le PDF.");
  return normalized;
}

export function captureByAliases(
  source: string,
  aliases: string[],
  valuePattern = "[^|;]{1,200}",
): string | null {
  if (!source.trim() || aliases.length === 0) return null;
  const alternation = aliases.map(aliasToRegex).join("|");
  const re = new RegExp(
    `(?:^|\\s)(?:${alternation})\\s*(?::|=|\\-|=>|est)?\\s*(${valuePattern})`,
    "i",
  );
  const match = source.match(re)?.[1]?.trim();
  return match && match.length > 0 ? match : null;
}

export function normalizeNumericString(raw: string | null): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/\s/g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function normalizeDateToIso(raw: string | null): string | null {
  if (!raw) return null;
  const v = raw.trim();
  // yyyy-mm-dd or yyyy-mm-ddThh:mm
  if (/^\d{4}-\d{2}-\d{2}([tT ][0-9:.+\-zZ]+)?$/.test(v)) {
    return v.includes("T") || v.includes("t") ? v.replace("t", "T") : `${v}T00:00:00.000Z`;
  }
  // dd/mm/yyyy [hh:mm]
  const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?$/);
  if (m) {
    const [, dd, mm, yyyy, hh = "00", min = "00"] = m;
    return `${yyyy}-${mm}-${dd}T${hh}:${min}:00.000Z`;
  }
  return null;
}
