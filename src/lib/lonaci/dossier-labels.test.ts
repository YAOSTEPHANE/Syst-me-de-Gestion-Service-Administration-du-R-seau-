import { describe, expect, it } from "vitest";

import {
  formatDossierOperationLabel,
  formatDossierTypeDetail,
  parseContratOperationType,
} from "@/lib/lonaci/dossier-labels";

describe("dossier-labels", () => {
  it("parseContratOperationType lit le payload", () => {
    expect(parseContratOperationType({ operationType: "NOUVEAU" })).toBe("NOUVEAU");
    expect(parseContratOperationType({ operationType: "actualisation" })).toBe("ACTUALISATION");
    expect(parseContratOperationType({})).toBeNull();
  });

  it("formatDossierOperationLabel affiche l'opération métier", () => {
    expect(formatDossierOperationLabel("CONTRAT_ACTUALISATION", { operationType: "NOUVEAU" })).toBe(
      "Nouveau contrat",
    );
    expect(formatDossierOperationLabel("CONTRAT_ACTUALISATION", { operationType: "ACTUALISATION" })).toBe(
      "Actualisation d'annexe",
    );
  });

  it("formatDossierTypeDetail combine catégorie et opération", () => {
    expect(formatDossierTypeDetail("CONTRAT_ACTUALISATION", { operationType: "NOUVEAU" })).toBe(
      "Dossier contrat — Nouveau contrat",
    );
  });
});
