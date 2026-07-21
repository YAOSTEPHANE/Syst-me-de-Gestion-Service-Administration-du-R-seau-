import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";

import type { UnifiedAuditLogItem } from "@/lib/lonaci/audit-logs";
import type { MonitoringEventListItem } from "@/lib/observability/events";
import {
  renderDailySupervisionPdf,
  renderMonitoringEventsPdf,
  renderSupervisionExportPdf,
} from "@/lib/pdf";

interface ParsedPdf {
  pageCount: number;
  pages: string[];
}

const generatedAt = new Date("2026-07-21T09:30:00.000Z");

async function readPdf(buffer: Buffer): Promise<ParsedPdf> {
  const loadingTask = getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
  });
  const pdf = await loadingTask.promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(
      content.items
        .map((item) => ("str" in item ? item.str : ""))
        .filter(Boolean)
        .join(" "),
    );
  }

  await pdf.destroy();
  return { pageCount: pages.length, pages };
}

function expectPremiumPages(parsed: ParsedPdf): void {
  expect(parsed.pageCount).toBeGreaterThan(1);
  for (const [index, page] of parsed.pages.entries()) {
    expect(page).toContain("LONACI");
    expect(page).toContain(`Page ${index + 1}/${parsed.pageCount}`);
  }
}

function auditRows(count: number): UnifiedAuditLogItem[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `audit-${index + 1}`,
    source: index % 2 === 0 ? "AUTH" : "MONITORING",
    timestamp: new Date(generatedAt.getTime() - index * 60_000).toISOString(),
    status: index % 2 === 0 ? "SUCCESS" : "OPEN",
    code: `AUD-${String(index + 1).padStart(3, "0")}`,
    title: `Contrôle opérationnel ${index + 1}`,
    message: `Message de traçabilité détaillé pour l’entrée ${index + 1}.`,
    actor: `agent-${index + 1}`,
    targetRole: "CHEF_SERVICE",
  }));
}

function monitoringRows(count: number): MonitoringEventListItem[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `event-${index + 1}`,
    code: `MON-${String(index + 1).padStart(3, "0")}`,
    title: `Alerte critique ${index + 1}`,
    message: `Événement de monitoring nécessitant une vérification ${index + 1}.`,
    level: "CRITICAL",
    status: index % 2 === 0 ? "OPEN" : "ACK",
    ackedAt: index % 2 === 0 ? null : generatedAt.toISOString(),
    ackedByUserId: index % 2 === 0 ? null : "chef-service",
    roleTarget: "CHEF_SERVICE",
    metadata: null,
    createdAt: new Date(generatedAt.getTime() - index * 60_000).toISOString(),
  }));
}

describe("rapports opérationnels PDF premium", () => {
  it("structure et pagine l’export de supervision sans perdre la limite", async () => {
    const parsed = await readPdf(
      await renderSupervisionExportPdf({
        generatedAt,
        filters: {
          source: "MONITORING",
          status: "OPEN",
          agence: "Agence Plateau",
          slaStatus: "OVERDUE",
          query: "incident",
          from: "2026-07-01T00:00:00.000Z",
          to: "2026-07-21T23:59:59.000Z",
        },
        slaRows: [
          { module: "CONTRATS", pending: 12, overdue: 3 },
          { module: "CAUTIONS", pending: 8, overdue: 2 },
        ],
        auditLogs: auditRows(48),
        auditTotal: 723,
        auditLimit: 500,
      }),
    );

    expectPremiumPages(parsed);
    const text = parsed.pages.join(" ");
    expect(text).toContain("Export de supervision consolidée");
    expect(text).toContain("Métadonnées d’export");
    expect(text).toContain("limite 500");
    expect(text).toContain("AUD-048");
    expect(text).toContain("Journal d’audit");
  });

  it("structure et pagine le registre de monitoring jusqu’au dernier événement", async () => {
    const parsed = await readPdf(
      await renderMonitoringEventsPdf({
        generatedAt,
        filters: { code: "CRITICAL_WORKFLOW", status: "OPEN" },
        events: monitoringRows(90),
        total: 6400,
        limit: 5000,
      }),
    );

    expectPremiumPages(parsed);
    const text = parsed.pages.join(" ");
    expect(text).toContain("Export des événements de monitoring");
    expect(text).toContain("Métadonnées d’export");
    expect(text).toContain("limite 5000");
    expect(text).toContain("MON-090");
    for (const page of parsed.pages) {
      expect(page).toContain("MESSAGE");
    }
  });

  it("structure et pagine les 60 lignes autorisées du rapport cron", async () => {
    const dailyCsv = Array.from(
      { length: 80 },
      (_, index) => `section-${index + 1},indicateur-${index + 1},${index + 1}`,
    ).join("\n");
    const parsed = await readPdf(
      await renderDailySupervisionPdf({
        generatedAt,
        cautionsJ10: 14,
        successionStale: 7,
        dailyCsv,
        previewLimit: 60,
      }),
    );

    expectPremiumPages(parsed);
    const text = parsed.pages.join(" ");
    expect(text).toContain("Export de supervision automatique");
    expect(text).toContain("Indicateurs de supervision");
    expect(text).toContain("limite 60");
    expect(text).toContain("indicateur-60");
    expect(text).not.toContain("indicateur-61");
    for (const page of parsed.pages) {
      expect(page).toContain("CONTENU CSV");
    }
  });
});
