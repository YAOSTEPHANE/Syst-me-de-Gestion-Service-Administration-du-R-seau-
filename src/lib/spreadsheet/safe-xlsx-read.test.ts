import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";

import {
  SPREADSHEET_IMPORT_MAX_SHEETS,
  SPREADSHEET_IMPORT_MAX_TOTAL_CELLS,
  readWorkbookFromArrayBuffer,
  sheetToJsonFirstSheet,
} from "@/lib/spreadsheet/safe-xlsx-read";

function workbookToBuffer(wb: XLSX.WorkBook): ArrayBuffer {
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

describe("safe-xlsx-read", () => {
  it("rejette un classeur avec trop de feuilles", async () => {
    const wb = XLSX.utils.book_new();
    for (let i = 0; i < SPREADSHEET_IMPORT_MAX_SHEETS + 1; i += 1) {
      const sheet = XLSX.utils.aoa_to_sheet([["ok"]]);
      XLSX.utils.book_append_sheet(wb, sheet, `S${i}`);
    }

    await expect(readWorkbookFromArrayBuffer(workbookToBuffer(wb))).rejects.toThrow(
      `maximum ${SPREADSHEET_IMPORT_MAX_SHEETS}`,
    );
  });

  it("rejette un classeur trop dense en cellules", async () => {
    const wb = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([["seed"]]);
    sheet["!ref"] = XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: 499, c: 400 },
    }); // 500 * 401 = 200500 cellules
    XLSX.utils.book_append_sheet(wb, sheet, "Dense");

    await expect(readWorkbookFromArrayBuffer(workbookToBuffer(wb))).rejects.toThrow(
      `maximum ${SPREADSHEET_IMPORT_MAX_TOTAL_CELLS}`,
    );
  });

  it("lit correctement un classeur valide", async () => {
    const wb = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ["code", "libelle"],
      ["A01", "Agence Cocody"],
    ]);
    XLSX.utils.book_append_sheet(wb, sheet, "Agences");

    const loaded = await readWorkbookFromArrayBuffer(workbookToBuffer(wb));
    const rows = await sheetToJsonFirstSheet<{ code: string; libelle: string }>(loaded);
    expect(rows).toEqual([{ code: "A01", libelle: "Agence Cocody" }]);
  });
});
