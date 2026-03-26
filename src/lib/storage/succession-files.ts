import { createReadStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.join(process.cwd(), "storage", "lonaci", "succession");

export const MAX_SUCCESSION_FILE_BYTES = 10 * 1024 * 1024;

export const SUCCESSION_ALLOWED_MIME: Record<string, true> = {
  "application/pdf": true,
  "image/jpeg": true,
  "image/png": true,
  "image/webp": true,
};

function sanitizeFilename(filename: string): string {
  return filename
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
}

export async function saveSuccessionActeDeces(caseId: string, originalName: string, bytes: Buffer) {
  const safe = sanitizeFilename(originalName || "acte-deces");
  const dir = path.join(ROOT, caseId);
  await mkdir(dir, { recursive: true });
  const relativePath = path.join(caseId, `acte-deces-${safe}`);
  await writeFile(path.join(ROOT, relativePath), bytes);
  return relativePath.replace(/\\/g, "/");
}

export async function saveSuccessionDocument(caseId: string, documentId: string, originalName: string, bytes: Buffer) {
  const safe = sanitizeFilename(originalName || "document");
  const dir = path.join(ROOT, caseId);
  await mkdir(dir, { recursive: true });
  const relativePath = path.join(caseId, `${documentId}-${safe}`);
  await writeFile(path.join(ROOT, relativePath), bytes);
  return relativePath.replace(/\\/g, "/");
}

export function createSuccessionReadStream(storedRelativePath: string) {
  return createReadStream(path.join(ROOT, storedRelativePath));
}

