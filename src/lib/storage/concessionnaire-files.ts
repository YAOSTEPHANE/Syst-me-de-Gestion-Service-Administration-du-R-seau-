import { createReadStream } from "fs";
import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";

const ROOT = path.join(process.cwd(), "uploads", "concessionnaires");

export const MAX_PIECE_BYTES = 10 * 1024 * 1024;

export const ALLOWED_PIECE_MIME: Record<string, true> = {
  "image/jpeg": true,
  "image/png": true,
  "image/webp": true,
  "application/pdf": true,
};

function sanitizeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180);
}

export async function saveConcessionnairePiece(
  concessionnaireId: string,
  pieceId: string,
  originalFilename: string,
  buffer: Buffer,
): Promise<string> {
  const dir = path.join(ROOT, concessionnaireId);
  await mkdir(dir, { recursive: true });
  const safe = sanitizeFilename(originalFilename || "fichier");
  const relative = path.join(concessionnaireId, `${pieceId}_${safe}`).replace(/\\/g, "/");
  const absolute = path.join(ROOT, relative);
  await writeFile(absolute, buffer);
  return relative;
}

export function getPieceAbsolutePath(storedRelativePath: string) {
  return path.join(ROOT, storedRelativePath);
}

export function createPieceReadStream(storedRelativePath: string) {
  return createReadStream(getPieceAbsolutePath(storedRelativePath));
}

export async function deletePieceFile(storedRelativePath: string) {
  try {
    await unlink(getPieceAbsolutePath(storedRelativePath));
  } catch {
    // fichier déjà absent
  }
}
