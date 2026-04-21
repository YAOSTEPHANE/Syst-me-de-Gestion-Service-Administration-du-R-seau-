import { afterEach, describe, expect, it, vi } from "vitest";

describe("import format policy", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("bloque Excel par défaut sur les modules critiques", async () => {
    vi.stubEnv("NEXT_PUBLIC_IMPORT_ALLOW_EXCEL_MODULES", "");
    const policy = await import("@/lib/spreadsheet/import-format-policy");
    expect(policy.isExcelImportAllowed("CONTRATS")).toBe(false);
    expect(policy.getImportAcceptAttribute("CONTRATS")).toBe(".json,.csv,.pdf");
  });

  it("autorise Excel pour un module explicitement whitelisté", async () => {
    vi.stubEnv("NEXT_PUBLIC_IMPORT_ALLOW_EXCEL_MODULES", "CONTRATS");
    const policy = await import("@/lib/spreadsheet/import-format-policy");
    expect(policy.isExcelImportAllowed("CONTRATS")).toBe(true);
    expect(policy.getImportAcceptAttribute("CONTRATS")).toBe(".json,.csv,.xlsx,.xls,.pdf");
  });

  it("autorise Excel partout avec le joker *", async () => {
    vi.stubEnv("NEXT_PUBLIC_IMPORT_ALLOW_EXCEL_MODULES", "*");
    const policy = await import("@/lib/spreadsheet/import-format-policy");
    expect(policy.isExcelImportAllowed("CONTRATS")).toBe(true);
    expect(policy.isExcelImportAllowed("CAUTIONS")).toBe(true);
    expect(policy.isExcelImportAllowed("PDV_INTEGRATIONS")).toBe(true);
  });
});
