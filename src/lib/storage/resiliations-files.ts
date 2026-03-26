import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.join(process.cwd(), "storage", "lonaci", "resiliations");

export const MAX_RESILIATION_FILE_BYTES = 8 * 1024 * 1024;

export const RESILIATION_ALLOWED_MIME: Record<string, true> = {
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

export async function saveResiliationAttachment(
  resiliationId: string,
  attachmentId: string,
  originalName: string,
  bytes: Buffer,
) {
  const safe = sanitizeFilename(originalName || "document");
  const dir = path.join(ROOT, resiliationId);
  await mkdir(dir, { recursive: true });
  const relativePath = path.join(resiliationId, `${attachmentId}-${safe}`);
  await writeFile(path.join(ROOT, relativePath), bytes);
  return relativePath.replace(/\\/g, "/");
}

