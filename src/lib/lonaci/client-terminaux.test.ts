import { describe, expect, it } from "vitest";

import {
  clientTerminauxEqual,
  clientTerminauxLegacyFields,
  formatClientTerminaux,
  mergeClientTerminaux,
  normalizeClientTerminaux,
  resolveClientTerminaux,
} from "@/lib/lonaci/client-terminaux";

describe("client-terminaux", () => {
  it("normalise les codes, supprime vides et doublons", () => {
    expect(
      normalizeClientTerminaux([
        { codeMachine: " tpe01 ", numeroTpm: "" },
        { codeMachine: "", numeroTpm: "9" },
        { codeMachine: "TPE01", numeroTpm: "12" },
        { codeMachine: "tpe02", numeroTpm: null },
      ]),
    ).toEqual([
      { codeMachine: "TPE01", numeroTpm: "12" },
      { codeMachine: "TPE02", numeroTpm: null },
    ]);
  });

  it("reconstruit la liste depuis les anciens champs", () => {
    expect(resolveClientTerminaux({ terminaux: [], codeMachine: "A1", numeroTpm: "77" })).toEqual([
      { codeMachine: "A1", numeroTpm: "77" },
    ]);
    expect(resolveClientTerminaux({ codeMachine: "A1; a2 / A3", numeroTpm: "1,2,3" })).toEqual([
      { codeMachine: "A1", numeroTpm: "1" },
      { codeMachine: "A2", numeroTpm: "2" },
      { codeMachine: "A3", numeroTpm: "3" },
    ]);
    expect(resolveClientTerminaux({ codeMachine: "A1, A2", numeroTpm: "5" })).toEqual([
      { codeMachine: "A1", numeroTpm: null },
      { codeMachine: "A2", numeroTpm: null },
    ]);
    expect(resolveClientTerminaux({ codeMachine: null })).toEqual([]);
  });

  it("privilégie la liste terminaux sur les anciens champs", () => {
    expect(
      resolveClientTerminaux({
        terminaux: [{ codeMachine: "B1", numeroTpm: null }],
        codeMachine: "OLD",
      }),
    ).toEqual([{ codeMachine: "B1", numeroTpm: null }]);
  });

  it("ajoute les TPE entrants sans perdre les existants", () => {
    const merged = mergeClientTerminaux(
      [
        { codeMachine: "T1", numeroTpm: null },
        { codeMachine: "T2", numeroTpm: "2" },
      ],
      [
        { codeMachine: "t1", numeroTpm: "10" },
        { codeMachine: "T3", numeroTpm: null },
      ],
    );
    expect(merged).toEqual([
      { codeMachine: "T1", numeroTpm: "10" },
      { codeMachine: "T2", numeroTpm: "2" },
      { codeMachine: "T3", numeroTpm: null },
    ]);
    expect(
      mergeClientTerminaux([{ codeMachine: "T2", numeroTpm: "2" }], [{ codeMachine: "T2", numeroTpm: null }]),
    ).toEqual([{ codeMachine: "T2", numeroTpm: "2" }]);
  });

  it("dérive les anciens champs et compare les listes", () => {
    const list = [
      { codeMachine: "T1", numeroTpm: "1" },
      { codeMachine: "T2", numeroTpm: null },
    ];
    expect(clientTerminauxLegacyFields(list)).toEqual({ codeMachine: "T1", numeroTpm: "1", nombreTpm: 2 });
    expect(clientTerminauxLegacyFields([])).toEqual({ codeMachine: null, numeroTpm: null, nombreTpm: null });
    expect(clientTerminauxEqual(list, [...list])).toBe(true);
    expect(clientTerminauxEqual(list, list.slice(0, 1))).toBe(false);
    expect(formatClientTerminaux(list)).toBe("T1 (TPM 1), T2");
  });
});
