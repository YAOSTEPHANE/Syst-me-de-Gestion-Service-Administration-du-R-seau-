import { describe, expect, it } from "vitest";

import {
  cautionPaidPeriodMongoRange,
  cautionPaidPresetRange,
  parseIsoDay,
  resolveCautionPaidPeriod,
} from "@/lib/lonaci/caution-paid-period";

const today = new Date(2026, 9, 5, 16, 30);

describe("resolveCautionPaidPeriod", () => {
  it("retombe sur le mois en cours sans borne", () => {
    expect(resolveCautionPaidPeriod({}, today)).toEqual({
      from: new Date(2026, 9, 1),
      toExclusive: new Date(2026, 10, 1),
    });
  });

  it("inclut toute la journée de fin", () => {
    expect(resolveCautionPaidPeriod({ paidFrom: "2026-01-15", paidTo: "2026-03-31" }, today)).toEqual({
      from: new Date(2026, 0, 15),
      toExclusive: new Date(2026, 3, 1),
    });
  });

  it("accepte une borne ouverte", () => {
    const period = resolveCautionPaidPeriod({ paidTo: "2026-10-05" }, today);
    expect(period.from).toBeNull();
    expect(cautionPaidPeriodMongoRange(period)).toEqual({ $lt: new Date(2026, 9, 6) });
  });
});

describe("parseIsoDay", () => {
  it("rejette les dates impossibles ou mal formées", () => {
    expect(parseIsoDay("2026-02-30")).toBeNull();
    expect(parseIsoDay("05/10/2026")).toBeNull();
  });
});

describe("cautionPaidPresetRange", () => {
  it("calcule les raccourcis", () => {
    expect(cautionPaidPresetRange("MOIS", today)).toEqual({ paidFrom: "2026-10-01", paidTo: "2026-10-31" });
    expect(cautionPaidPresetRange("MOIS_PRECEDENT", today)).toEqual({ paidFrom: "2026-09-01", paidTo: "2026-09-30" });
    expect(cautionPaidPresetRange("ANNEE", today)).toEqual({ paidFrom: "2026-01-01", paidTo: "2026-12-31" });
    expect(cautionPaidPresetRange("TOUT", today)).toEqual({ paidFrom: "", paidTo: "2026-10-05" });
  });

  it("gère le mois précédent en janvier", () => {
    expect(cautionPaidPresetRange("MOIS_PRECEDENT", new Date(2026, 0, 10))).toEqual({
      paidFrom: "2025-12-01",
      paidTo: "2025-12-31",
    });
  });
});
