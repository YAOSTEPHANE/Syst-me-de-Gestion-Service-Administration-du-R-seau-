import { createReadStream } from "fs";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

const ROOT = path.join(process.cwd(), "uploads", "contrats");

export async function saveContratArchivePdf(
  dossierId: string,
  contratReference: string,
  buffer: Buffer,
): Promise<string> {
  const dir = path.join(ROOT, dossierId);
  await mkdir(dir, { recursive: true });
  const safeRef = contratReference.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
  const relative = path.join(dossierId, `${safeRef}_signe.pdf`).replace(/\\/g, "/");
  await writeFile(path.join(ROOT, relative), buffer);
  return relative;
}

export function createContratArchiveReadStream(storedRelativePath: string) {
  return createReadStream(path.join(ROOT, storedRelativePath));
}
