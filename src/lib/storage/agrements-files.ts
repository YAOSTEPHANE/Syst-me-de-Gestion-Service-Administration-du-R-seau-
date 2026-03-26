import { createReadStream } from "fs";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

const ROOT = path.join(process.cwd(), "uploads", "agrements");

export const MAX_AGREMENT_FILE_BYTES = 10 * 1024 * 1024;
export const AGREMENT_ALLOWED_MIME = "application/pdf";

function sanitizeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180);
}

export async function saveAgrementPdf(
  agrementId: string,
  originalFilename: string,
  buffer: Buffer,
): Promise<string> {
  const dir = path.join(ROOT, agrementId);
  await mkdir(dir, { recursive: true });
  const safe = sanitizeFilename(originalFilename || "agrement.pdf");
  const relative = path.join(agrementId, `agrement_${safe}`).replace(/\\/g, "/");
  const absolute = path.join(ROOT, relative);
  await writeFile(absolute, buffer);
  return relative;
}

export function createAgrementReadStream(storedRelativePath: string) {
  return createReadStream(path.join(ROOT, storedRelativePath));
}

