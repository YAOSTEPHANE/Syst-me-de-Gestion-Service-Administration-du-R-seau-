/**
 * Lecture Excel côté client avec plafonds (DoS / fichiers malveillants).
 * La lib `xlsx` (SheetJS community) a des CVE connues ; on limite taille et lignes.
 */
import type { WorkBook, WorkSheet } from "xlsx";

export const SPREADSHEET_IMPORT_MAX_BYTES = 5 * 1024 * 1024;
export const SPREADSHEET_IMPORT_MAX_ROWS = 10_000;

function sheetRowCount(sheet: WorkSheet, XLSX: typeof import("xlsx")): number {
  const ref = sheet["!ref"];
  if (!ref) return 0;
  const range = XLSX.utils.decode_range(ref);
  return range.e.r - range.s.r + 1;
}

export async function readWorkbookFromArrayBuffer(buffer: ArrayBuffer): Promise<WorkBook> {
  if (buffer.byteLength > SPREADSHEET_IMPORT_MAX_BYTES) {
    throw new Error("Fichier Excel trop volumineux (maximum 5 Mo).");
  }
  const XLSX = await import("xlsx");
  return XLSX.read(buffer, { type: "array", dense: true });
}

export async function sheetToJsonFirstSheet<T extends Record<string, unknown>>(
  wb: WorkBook,
  options?: { defval?: string | number | boolean | null },
): Promise<T[]> {
  const XLSX = await import("xlsx");
  const name = wb.SheetNames[0];
  if (!name) throw new Error("Fichier Excel vide.");
  const sheet = wb.Sheets[name];
  if (!sheet) throw new Error("Fichier Excel vide.");
  const rows = sheetRowCount(sheet, XLSX);
  if (rows > SPREADSHEET_IMPORT_MAX_ROWS) {
    throw new Error(`Trop de lignes dans la feuille (maximum ${SPREADSHEET_IMPORT_MAX_ROWS}).`);
  }
  const defval = options?.defval ?? null;
  return XLSX.utils.sheet_to_json<T>(sheet, { defval });
}
