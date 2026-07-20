import { createReadStream } from "fs";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

const ROOT = path.join(process.cwd(), "uploads", "contrats");

export async function saveContratArchivePdf(
  dossierId: string,
  contratReference: string,
  buffer: Buffer,
): Promise<string> {
  const safeRef = contratReference.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
  return saveContratPdfFile(dossierId, `${safeRef}_signe.pdf`, buffer);
}

export async function saveAnnexeArchivePdf(
  dossierId: string,
  annexeReference: string,
  buffer: Buffer,
): Promise<string> {
  const safeRef = annexeReference.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
  return saveContratPdfFile(dossierId, `${safeRef}_annexe_signe.pdf`, buffer);
}

async function saveContratPdfFile(dossierId: string, filename: string, buffer: Buffer): Promise<string> {
  const dir = path.join(ROOT, dossierId);
  await mkdir(dir, { recursive: true });
  const relative = path.join(dossierId, filename).replace(/\\/g, "/");
  await writeFile(path.join(ROOT, relative), buffer);
  return relative;
}

export function createContratArchiveReadStream(storedRelativePath: string) {
  return createReadStream(path.join(ROOT, storedRelativePath));
}
