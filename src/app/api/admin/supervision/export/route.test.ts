import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireApiAuthMock,
  listUnifiedAuditLogsMock,
  getDossierValidationSnapshotMock,
  buildReportSummaryMock,
  ensureSuccessionIndexesMock,
  listSuccessionStaleAlertsMock,
  listCautionAlertsJ10Mock,
} = vi.hoisted(() => ({
  requireApiAuthMock: vi.fn(),
  listUnifiedAuditLogsMock: vi.fn(),
  getDossierValidationSnapshotMock: vi.fn(),
  buildReportSummaryMock: vi.fn(),
  ensureSuccessionIndexesMock: vi.fn(),
  listSuccessionStaleAlertsMock: vi.fn(),
  listCautionAlertsJ10Mock: vi.fn(),
}));

vi.mock("pdfkit", () => ({
  default: class MockPdfDocument {
    on() {}
    fontSize() {
      return this;
    }
    text() {
      return this;
    }
    moveDown() {
      return this;
    }
    end() {}
  },
}));

vi.mock("@/lib/auth/guards", () => ({
  requireApiAuth: requireApiAuthMock,
}));

vi.mock("@/lib/lonaci/audit-logs", () => ({
  listUnifiedAuditLogs: listUnifiedAuditLogsMock,
}));

vi.mock("@/lib/lonaci/dashboard-stats", () => ({
  getDossierValidationSnapshot: getDossierValidationSnapshotMock,
}));

vi.mock("@/lib/lonaci/reports", () => ({
  buildReportSummary: buildReportSummaryMock,
}));

vi.mock("@/lib/lonaci/succession", () => ({
  ensureSuccessionIndexes: ensureSuccessionIndexesMock,
  listSuccessionStaleAlerts: listSuccessionStaleAlertsMock,
}));

vi.mock("@/lib/lonaci/sprint4", () => ({
  listCautionAlertsJ10: listCautionAlertsJ10Mock,
}));

import { expectResponse } from "@/test-utils/expect-response";

import { GET } from "./route";

describe("GET /api/admin/supervision/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireApiAuthMock.mockResolvedValue({ user: { _id: "admin", role: "CHEF_SERVICE" } });
    ensureSuccessionIndexesMock.mockResolvedValue(undefined);
    buildReportSummaryMock.mockResolvedValue({
      succession: { ouverts: 0 },
      pdvIntegrations: { nonFinalise: 0 },
    });
    listCautionAlertsJ10Mock.mockResolvedValue([]);
    listSuccessionStaleAlertsMock.mockResolvedValue([]);
    listUnifiedAuditLogsMock.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 500 });
    getDossierValidationSnapshotMock.mockResolvedValue({
      contratSoumis: 0,
      contratSoumisRetard48h: 0,
      cautionsEnAttente: 0,
      cautionsJ10: 0,
      pdvNonFinalise: 0,
      pdvEnCoursRetard5j: 0,
      successionOuverts: 0,
      successionStale30j: 0,
      agrementsEnAttente: 0,
      agrementsRetard: 0,
    });
  });

  it("exporte en CSV", async () => {
    const req = new NextRequest("http://localhost:3000/api/admin/supervision/export?format=csv");
    const res = await GET(req);
    expectResponse(res);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
  });

  it("exporte en XLSX", async () => {
    const req = new NextRequest("http://localhost:3000/api/admin/supervision/export?format=xlsx");
    const res = await GET(req);
    expectResponse(res);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
  });
});
