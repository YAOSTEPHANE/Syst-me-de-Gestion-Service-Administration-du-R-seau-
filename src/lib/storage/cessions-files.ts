import { createReadStream } from "fs";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

const ROOT = path.join(process.cwd(), "uploads", "cessions");

export const MAX_CESSION_FILE_BYTES = 10 * 1024 * 1024;

export const CESSION_ALLOWED_MIME: Record<string, true> = {
  "application/pdf": true,
  "image/jpeg": true,
  "image/png": true,
  "image/webp": true,
};

function sanitizeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180);
}

export async function saveCessionAttachment(
  cessionId: string,
  attachmentId: string,
  originalFilename: string,
  buffer: Buffer,
): Promise<string> {
  const dir = path.join(ROOT, cessionId);
  await mkdir(dir, { recursive: true });
  const safe = sanitizeFilename(originalFilename || "document");
  const relative = path.join(cessionId, `${attachmentId}_${safe}`).replace(/\\/g, "/");
  const absolute = path.join(ROOT, relative);
  await writeFile(absolute, buffer);
  return relative;
}

export function createCessionReadStream(storedRelativePath: string) {
  return createReadStream(path.join(ROOT, storedRelativePath));
}

