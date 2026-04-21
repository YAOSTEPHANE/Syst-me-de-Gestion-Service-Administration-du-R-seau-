export const CRITICAL_EXCEL_RESTRICTED_MODULES = [
  "CONTRATS",
  "CAUTIONS",
  "BANCARISATION",
  "PDV_INTEGRATIONS",
] as const;

export type SpreadsheetImportModule =
  | (typeof CRITICAL_EXCEL_RESTRICTED_MODULES)[number]
  | "AGREMENTS"
  | "ATTESTATIONS_DOMICILIATION"
  | "CESSIONS"
  | "CONCESSIONNAIRES"
  | "RESILIATIONS";

const allowExcelModulesRaw = process.env.NEXT_PUBLIC_IMPORT_ALLOW_EXCEL_MODULES ?? "";
const allowExcelModules = allowExcelModulesRaw
  .split(",")
  .map((value) => value.trim().toUpperCase())
  .filter(Boolean);
const allowExcelEverywhere = allowExcelModules.includes("*");

export function isExcelImportAllowed(moduleName: SpreadsheetImportModule): boolean {
  if (allowExcelEverywhere) return true;
  if (allowExcelModules.includes(moduleName)) return true;
  return !CRITICAL_EXCEL_RESTRICTED_MODULES.some((restricted) => restricted === moduleName);
}

export function assertExcelImportAllowed(moduleName: SpreadsheetImportModule): void {
  if (isExcelImportAllowed(moduleName)) return;
  throw new Error(
    "Import Excel temporairement désactivé pour ce module critique. Utilisez .json/.csv (ou .pdf), ou activez explicitement ce module via NEXT_PUBLIC_IMPORT_ALLOW_EXCEL_MODULES.",
  );
}

export function getImportAcceptAttribute(moduleName: SpreadsheetImportModule): string {
  if (isExcelImportAllowed(moduleName)) return ".json,.csv,.xlsx,.xls,.pdf";
  return ".json,.csv,.pdf";
}
