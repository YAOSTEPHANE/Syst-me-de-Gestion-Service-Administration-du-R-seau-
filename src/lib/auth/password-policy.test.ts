import { describe, expect, it } from "vitest";

import {
  formatUtcYearMonth,
  isLastUtcDayOfMonth,
  startOfCurrentUtcMonth,
  userRequiresPasswordRotation,
} from "./password-policy";

describe("password-policy", () => {
  it("startOfCurrentUtcMonth est le 1er du mois à minuit UTC", () => {
    const s = startOfCurrentUtcMonth();
    expect(s.getUTCDate()).toBe(1);
    expect(s.getUTCHours()).toBe(0);
    expect(s.getUTCMinutes()).toBe(0);
    expect(s.getUTCSeconds()).toBe(0);
  });

  it("exige un changement si le dernier changement est strictement avant le 1er du mois courant (chef de service)", () => {
    const start = startOfCurrentUtcMonth();
    const before = new Date(start.getTime() - 86_400_000);
    expect(
      userRequiresPasswordRotation({
        role: "CHEF_SERVICE",
        passwordChangedAt: before,
        createdAt: before,
      }),
    ).toBe(true);
  });

  it("n’exige pas de changement pour un rôle non admin même si le MDP est ancien", () => {
    const start = startOfCurrentUtcMonth();
    const before = new Date(start.getTime() - 86_400_000);
    expect(
      userRequiresPasswordRotation({
        role: "AGENT",
        passwordChangedAt: before,
        createdAt: before,
      }),
    ).toBe(false);
  });

  it("n’exige pas de changement si le dernier changement est le 1er du mois ou après", () => {
    const start = startOfCurrentUtcMonth();
    expect(
      userRequiresPasswordRotation({
        role: "CHEF_SERVICE",
        passwordChangedAt: start,
        createdAt: new Date(0),
      }),
    ).toBe(false);
    expect(
      userRequiresPasswordRotation({
        role: "CHEF_SERVICE",
        passwordChangedAt: new Date(start.getTime() + 60_000),
        createdAt: new Date(0),
      }),
    ).toBe(false);
  });

  it("utilise createdAt si passwordChangedAt est absent", () => {
    const start = startOfCurrentUtcMonth();
    const before = new Date(start.getTime() - 1);
    expect(
      userRequiresPasswordRotation({
        role: "CHEF_SERVICE",
        passwordChangedAt: null,
        createdAt: before,
      }),
    ).toBe(true);
  });

  it("formatUtcYearMonth renvoie YYYY-MM en UTC", () => {
    expect(formatUtcYearMonth(new Date(Date.UTC(2026, 3, 30)))).toBe("2026-04");
    expect(formatUtcYearMonth(new Date(Date.UTC(2026, 10, 5)))).toBe("2026-11");
  });

  it("isLastUtcDayOfMonth: 30 avril oui, 29 avril non", () => {
    expect(isLastUtcDayOfMonth(new Date(Date.UTC(2026, 3, 30)))).toBe(true);
    expect(isLastUtcDayOfMonth(new Date(Date.UTC(2026, 3, 29)))).toBe(false);
  });

  it("isLastUtcDayOfMonth: 28 février 2025 oui, 28 février 2024 non (bissextile)", () => {
    expect(isLastUtcDayOfMonth(new Date(Date.UTC(2025, 1, 28)))).toBe(true);
    expect(isLastUtcDayOfMonth(new Date(Date.UTC(2024, 1, 28)))).toBe(false);
    expect(isLastUtcDayOfMonth(new Date(Date.UTC(2024, 1, 29)))).toBe(true);
  });
});
