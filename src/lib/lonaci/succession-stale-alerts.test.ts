import { describe, expect, it } from "vitest";

import {
  daysBetween,
  evaluateSuccessionStale,
  successionDeclaredAt,
  successionLastActivityAt,
} from "@/lib/lonaci/succession-stale-alerts";
import type { SuccessionCaseDocument } from "@/lib/lonaci/types";

function baseRow(overrides: Partial<SuccessionCaseDocument> = {}): SuccessionCaseDocument {
  const createdAt = new Date("2025-01-01T10:00:00.000Z");
  return {
    reference: "S-TEST",
    concessionnaireId: "c1",
    agenceId: "a1",
    status: "OUVERT",
    dateDeces: createdAt,
    acteDeces: null,
    ayantDroitNom: null,
    ayantDroitLienParente: null,
    ayantDroitTelephone: null,
    ayantDroitEmail: null,
    documents: [],
    decision: null,
    validationN1At: null,
    validationN1ByUserId: null,
    validationN2At: null,
    validationN2ByUserId: null,
    stepHistory: [
      {
        step: "DECLARATION_DECES",
        completedAt: createdAt,
        completedByUserId: "u1",
        comment: null,
      },
    ],
    createdByUserId: "u1",
    updatedByUserId: "u1",
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
    ...overrides,
  };
}

describe("succession-stale-alerts", () => {
  it("ancre l'inactivité sur la dernière activité, pas seulement updatedAt", () => {
    const declared = new Date("2025-01-01T10:00:00.000Z");
    const validation = new Date("2025-02-15T10:00:00.000Z");
    const row = baseRow({
      updatedAt: declared,
      validationN1At: validation,
      validationN2At: validation,
    });
    const last = successionLastActivityAt(row);
    expect(last.getTime()).toBe(validation.getTime());
  });

  it("ne déclenche pas l'alerte avant 30 jours depuis la déclaration", () => {
    const now = new Date("2025-01-20T10:00:00.000Z");
    const row = baseRow();
    const result = evaluateSuccessionStale(row, 30, now);
    expect(result.stale).toBe(false);
    expect(result.daysSinceDeclaration).toBe(19);
  });

  it("déclenche l'alerte si 30 j sans action après déclaration", () => {
    const now = new Date("2025-03-05T10:00:00.000Z");
    const row = baseRow();
    const result = evaluateSuccessionStale(row, 30, now);
    expect(result.stale).toBe(true);
    expect(result.daysInactive).toBeGreaterThanOrEqual(30);
    expect(result.daysSinceDeclaration).toBeGreaterThanOrEqual(30);
  });

  it("réarme après une activité récente", () => {
    const now = new Date("2025-03-05T10:00:00.000Z");
    const recent = new Date("2025-03-01T10:00:00.000Z");
    const row = baseRow({
      updatedAt: recent,
      stepHistory: [
        {
          step: "DECLARATION_DECES",
          completedAt: new Date("2025-01-01T10:00:00.000Z"),
          completedByUserId: "u1",
          comment: null,
        },
        {
          step: "IDENTIFICATION_AYANT_DROIT",
          completedAt: recent,
          completedByUserId: "u1",
          comment: null,
        },
      ],
    });
    const result = evaluateSuccessionStale(row, 30, now);
    expect(result.stale).toBe(false);
    expect(daysBetween(successionDeclaredAt(row), now)).toBeGreaterThanOrEqual(30);
  });
});
