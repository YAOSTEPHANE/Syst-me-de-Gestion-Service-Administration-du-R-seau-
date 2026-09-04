import { describe, expect, it, vi } from "vitest";

import { logger } from "@/lib/observability/logger";
import { logPdfFailure, logWorkflowDenied } from "@/lib/observability/workflow-events";

vi.mock("@/lib/observability/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("workflow-events observability", () => {
  it("journalise un refus de transition", () => {
    logWorkflowDenied({
      module: "CESSIONS",
      code: "FORBIDDEN_TRANSITION",
      role: "AGENT",
      entityId: "abc",
      target: "REJETEE",
    });
    expect(logger.warn).toHaveBeenCalledWith(
      "Transition workflow refusée",
      expect.objectContaining({
        event: "WORKFLOW_DENIED",
        module: "CESSIONS",
        code: "FORBIDDEN_TRANSITION",
      }),
    );
  });

  it("journalise un échec PDF", () => {
    logPdfFailure({
      document: "contrat",
      code: "RENDER_FAILED",
      entityId: "d1",
      detail: "timeout",
    });
    expect(logger.error).toHaveBeenCalledWith(
      "Échec génération PDF",
      expect.objectContaining({
        event: "PDF_FAILURE",
        document: "contrat",
        code: "RENDER_FAILED",
      }),
    );
  });
});
